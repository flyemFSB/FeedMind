/**
 * FeedMind 桌面应用主进程。
 *
 * 架构：主进程内嵌 API（@feedmind/api/server-core），UI 窗口 + 两个隐藏标记窗口
 * （爬虫 feedmind-crawler、Agent feedmind-agent）。通过 --remote-debugging-port 暴露 CDP，
 * crawler-core / Agent 浏览器用 Playwright connectOverCDP 按标记选页驱动内置 Chromium
 * （不再自起 Chrome）。双隐藏窗口相互独立，Agent 会话与爬虫任务互不踩踏。
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { app, BrowserWindow, ipcMain, Menu, session, shell } from "electron";
import { config as loadDotenv } from "dotenv";

// 先定名再取单实例锁：Windows 锁文件按应用名归档，顺序颠倒会导致双实例都成功
app.setName("FeedMind");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows().find((w) => w.isVisible());
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// 必须在 app ready 前注入，否则 CDP 端口不生效
// 默认 9333：9222 常被系统 Chrome 等占用，导致 devtools 无法绑定。
// 注意：loopback 上的 CDP 端口允许本机任意进程通过 Runtime.evaluate 控制应用，
// 这是爬虫/Agent 浏览器的基础，属可接受的本地安全权衡。
const CDP_PORT = process.env["CDP_PORT"] ?? "9333";
app.commandLine.appendSwitch("remote-debugging-port", CDP_PORT);
app.commandLine.appendSwitch("remote-allow-origins", "*");

// 移除默认应用菜单（含 Edit/View 快捷键），官方 performance 文档建议在 ready 前调用
Menu.setApplicationMenu(null);

/**
 * 在 API 模块加载前备好关键环境变量。
 * 主进程产物经 tsc 编译到 dist/，API 内部基于 import.meta.url 推算的"项目根"会失效，
 * 因此一律用绝对路径显式指定数据目录，并补齐 ENCRYPTION_KEY。
 */
function prepareEnv(): void {
  if (!app.isPackaged) {
    loadDotenv({ path: path.resolve(app.getAppPath(), "../../.env") });
  }

  const dataRoot = app.isPackaged
    ? app.getPath("userData")
    : path.resolve(app.getAppPath(), "../../data");
  process.env["DATABASE_PATH"] ??= path.join(dataRoot, "feedmind.db");
  process.env["WIKI_DIR"] ??= path.join(dataRoot, "wiki");
  // 向量库 / skills 等其余数据目录统一走 DATA_DIR（打包后 import.meta.url 指向只读 asar）
  process.env["DATA_DIR"] ??= dataRoot;

  // CDP 端点与主进程端口保持一致，供 crawler-core / Agent 浏览器读取
  process.env["CDP_ENDPOINT"] ??= `http://127.0.0.1:${CDP_PORT}`;

  // 本机 HTTP_PROXY 会在 NODE_USE_ENV_PROXY 下劫持 Node 对本机的请求，
  // CDP 连接必须直连 127.0.0.1，故豁免 loopback；外部站点仍走代理
  process.env["NO_PROXY"] = [process.env["NO_PROXY"], "127.0.0.1", "localhost"]
    .filter(Boolean)
    .join(",");

  // 打包后无 .env：首次运行生成并持久化 AES 密钥（后续沿用，保证已加密数据可解密）
  if (!process.env["ENCRYPTION_KEY"]) {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    let key: string | undefined;
    if (existsSync(settingsPath)) {
      try {
        key = (JSON.parse(readFileSync(settingsPath, "utf8")) as { encryptionKey?: string })
          .encryptionKey;
      } catch {
        // 配置损坏则重新生成
      }
    }
    if (!key) {
      key = randomBytes(32).toString("hex");
      mkdirSync(app.getPath("userData"), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({ encryptionKey: key }, null, 2));
    }
    process.env["ENCRYPTION_KEY"] = key;
  }
}

/** 加载窗口 URL；dev 模式下 Vite 启动有延迟，失败则重试 */
async function loadWithRetry(win: BrowserWindow, url: string, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`无法加载 ${url}`);
}

/** 加载后的通用窗口兜底：ready-to-show 迟迟不触发时也显示窗口，避免停留在不可见状态 */
function showOnReady(win: BrowserWindow): void {
  const timer = setTimeout(() => win.show(), 10_000);
  win.once("ready-to-show", () => {
    clearTimeout(timer);
    win.show();
  });
  // 窗口提前销毁时清除定时器，避免对已销毁窗口调 show
  win.on("closed", () => clearTimeout(timer));
}

function getUiUrl(): string {
  return (
    process.env["VITE_DEV_SERVER_URL"] ?? `http://127.0.0.1:${process.env["API_PORT"] ?? "18790"}`
  );
}

// 模块级持有主窗口引用：macOS 关窗后需据此判断重建，不能依赖 getAllWindows
let mainWindow: BrowserWindow | null = null;

// agent 隐藏窗口标记：与 crawler-core / mastra 一致，据此区分生命周期策略
const AGENT_MARKER = "feedmind-agent";
// agent 空闲判定：超过该时长无浏览器活动则销毁窗口，释放渲染进程内存
const AGENT_IDLE_MS = 5 * 60 * 1000;

// 惰性隐藏窗口：按需创建。crawler 窗口任务结束即销毁；agent 窗口空闲超时销毁
const markedWindows = new Map<string, { win: BrowserWindow; timer: NodeJS.Timeout | null }>();

// 拒绝媒体权限（camera/mic/screen）：授予后 Chromium 会拉起 audio / video_capture 常驻
// utility 进程，窗口销毁也不退出，白占内存。应用自身无媒体功能，全局拒绝无副作用。
const MEDIA_PERMISSIONS = new Set(["media", "display-capture"]);

// 每次使用标记窗口后刷新空闲计时：仅 agent 窗口启用空闲销毁，crawler 由 closeBrowser 触发销毁
function refreshIdleTimer(marker: string): void {
  const entry = markedWindows.get(marker);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  if (marker !== AGENT_MARKER) return;
  entry.timer = setTimeout(() => void destroyMarkedWindow(marker), AGENT_IDLE_MS);
}

// 补建后必须等加载完成再返回：crawler-core 按窗口 URL 标记选页
async function ensureMarkedWindow(marker: string): Promise<void> {
  const existing = markedWindows.get(marker);
  if (existing && !existing.win.isDestroyed()) {
    if (existing.win.webContents.getURL().includes(marker)) {
      refreshIdleTimer(marker);
      return;
    }
    await existing.win.loadURL(`data:text/html,<title>${marker}</title>`);
    refreshIdleTimer(marker);
    return;
  }
  const win = await createMarkedWindow(marker);
  markedWindows.set(marker, { win, timer: null });
  win.on("closed", () => {
    if (markedWindows.get(marker)?.win === win) markedWindows.delete(marker);
  });
  refreshIdleTimer(marker);
}

// 窗口关闭后清掉会话里浏览站点注册的 Service Worker——应用自身不注册 SW，
// 否则 SW 渲染进程在窗口销毁后仍常驻内存（实测小红书 SW 占 ~150MB working set）。
async function destroyMarkedWindow(marker: string): Promise<void> {
  const entry = markedWindows.get(marker);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  if (!entry.win.isDestroyed()) entry.win.close();
  markedWindows.delete(marker);
  await session.defaultSession.clearStorageData({ storages: ["serviceworkers"] }).catch(() => {});
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0f172a",
    webPreferences: { sandbox: true, spellcheck: false },
  });
  // UI 中的外链（来源页、wiki 引用等 target=_blank）改用系统浏览器打开，
  // 避免意外 spawn 新的 Electron 窗口（每个窗口都是一份渲染进程内存/CPU 常驻）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.on("closed", () => {
    mainWindow = null;
    if (process.platform !== "darwin") app.quit();
  });
  showOnReady(win);
  return win;
}

/** 创建标记页隐藏窗口：爬虫与 Agent 各用独立窗口，会话互不踩踏 */
async function createMarkedWindow(marker: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      sandbox: true,
      spellcheck: false,
      // 禁自动播放：防爬虫/Agent 访问的视频站拉起常驻 audio 服务进程
      autoplayPolicy: "user-gesture-required",
    },
  });
  win.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  );
  await win.loadURL(`data:text/html,<title>${marker}</title>`);
  return win;
}

// ─── 应用内浏览器登录 ─────────────────────────────────────────────

/** 平台 → 登录页 URL 与 Cookie 捕获地址 */
const PLATFORM_LOGIN: Record<string, { url: string; cookieUrl: string }> = {
  bilibili: { url: "https://passport.bilibili.com/login", cookieUrl: "https://www.bilibili.com" },
  zhihu: { url: "https://www.zhihu.com/signin", cookieUrl: "https://www.zhihu.com" },
  weread: { url: "https://weread.qq.com/", cookieUrl: "https://weread.qq.com" },
  xiaohongshu: { url: "https://www.xiaohongshu.com/", cookieUrl: "https://www.xiaohongshu.com" },
  douyin: { url: "https://www.douyin.com/", cookieUrl: "https://www.douyin.com" },
};

/** 悬浮"登录完成"按钮：点击后经 preload 通知主进程捕获会话 Cookie */
const INJECT_LOGIN_BUTTON = `
(() => {
  if (document.getElementById('feedmindLoginDone')) return;
  const btn = document.createElement('div');
  btn.id = 'feedmindLoginDone';
  btn.textContent = '登录完成，保存并关闭';
  btn.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;padding:12px 22px;border-radius:10px;background:#22c55e;color:#fff;font-size:15px;font-family:system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);';
  btn.onclick = () => window.feedmindLogin.done();
  document.body.appendChild(btn);
})()`;

let activeLoginPlatform = "";
let loginResolve: ((cookies: string) => void) | null = null;
let loginWindow: BrowserWindow | null = null;
let loginTimeout: NodeJS.Timeout | null = null;

/** 结束一次登录等待：resolve 结果并清理窗口/定时器（幂等，完成/关窗/超时任一触发） */
function completeLogin(cookies: string): void {
  const r = loginResolve;
  loginResolve = null;
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = null;
  }
  loginWindow?.close();
  r?.(cookies);
}

// preload 触发：捕获当前登录窗口会话 Cookie，并结束等待
ipcMain.handle("feedmind-login-done", async (): Promise<{ ok: boolean }> => {
  const cfg = PLATFORM_LOGIN[activeLoginPlatform];
  let cookieStr = "";
  if (cfg) {
    const cookies = await session.defaultSession.cookies.get({ url: cfg.cookieUrl });
    cookieStr = cookies
      .filter((c) => c.name && c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }
  completeLogin(cookieStr);
  return { ok: true };
});

/** 打开平台登录窗口，等待用户完成登录，返回捕获的 Cookie 字符串 */
async function openLoginWindow(platform: string): Promise<string> {
  const cfg = PLATFORM_LOGIN[platform];
  if (!cfg) throw new Error(`未知平台: ${platform}`);
  // 单槽保护：已有登录窗口时不并发覆盖，避免前一个请求的 Promise 悬空或跨平台串包
  if (loginWindow) throw new Error("已有登录窗口打开中，请先完成当前登录");

  return new Promise<string>((resolve) => {
    loginResolve = resolve;
    activeLoginPlatform = platform;
    // 超时兜底：用户长时间未完成登录，关闭窗口并结束等待，避免请求永久挂起
    loginTimeout = setTimeout(() => completeLogin(""), 5 * 60 * 1000);

    loginWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      autoHideMenuBar: true,
      title: `登录 ${platform}`,
      webPreferences: {
        preload: path.join(app.getAppPath(), "login-preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });
    // 知乎等平台把含 Electron 的 UA 判定为过时客户端（10001 请升级客户端），须用标准 Chrome UA
    loginWindow.webContents.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    );
    loginWindow.webContents.on("did-finish-load", () => {
      void loginWindow?.webContents.executeJavaScript(INJECT_LOGIN_BUTTON).catch(() => {});
    });
    // 用户直接关窗视为未完成；completeLogin 已处理（loginResolve 已清空）时不重复 resolve
    loginWindow.on("closed", () => {
      loginWindow = null;
      if (loginResolve) completeLogin("");
    });
    void loginWindow.loadURL(cfg.url);
  });
}

async function bootstrap(): Promise<void> {
  prepareEnv();

  // 拒绝媒体权限，防止爬虫/Agent 访问的站点拉起 audio/video_capture 常驻进程。
  // check 与 request 两个 handler 必须成对设置：部分 Web API 先做 check 再发正式请求，只设 request 会漏。
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!MEDIA_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => !MEDIA_PERMISSIONS.has(permission),
  );

  // API 在 API 模块导入前完成环境准备，故延迟加载
  const {
    startApi,
    setLoginHandler,
    setMarkedWindowFactory,
    setMarkedWindowDestroyer,
    startKeepAlive,
  } = await import("@feedmind/api/server-core");

  // 生产模式同源 serve Web 构建产物；dev 模式由 Vite dev server 提供
  const webDist = process.env["VITE_DEV_SERVER_URL"]
    ? undefined
    : app.isPackaged
      ? path.join(process.resourcesPath, "web-dist")
      : path.resolve(app.getAppPath(), "../web/dist");
  await startApi(webDist ? { webDist } : {});

  // 注册应用内登录实现：前端调 /api/v1/cookiecloud/login/:platform 时打开登录窗口
  setLoginHandler(async (platform) => {
    const cookies = await openLoginWindow(platform);
    return { valid: cookies.length > 0, cookies };
  });

  // 注册惰性窗口工厂与销毁器：crawler 任务结束即销毁（closeBrowser 触发），
  // agent 空闲 5 分钟超时销毁（refreshIdleTimer 调度）
  setMarkedWindowFactory(ensureMarkedWindow);
  setMarkedWindowDestroyer(destroyMarkedWindow);

  mainWindow = createMainWindow();
  await loadWithRetry(mainWindow, getUiUrl());

  // 保活调度（weread 30 分钟刷 skey）首次触发时经 createBrowser 惰性补建爬虫窗口
  startKeepAlive();
}

// macOS 惯例：关闭全部窗口后应用驻留，点 Dock 重建窗口
app.on("activate", () => {
  if (mainWindow === null) {
    // 惰性隐藏窗口常驻（show:false，不计入窗口栈），重建主窗口即可复用
    mainWindow = createMainWindow();
    void loadWithRetry(mainWindow, getUiUrl());
  }
});

app
  .whenReady()
  .then(bootstrap)
  .catch((err) => {
    // eslint-disable-next-line no-console -- 启动失败需在主进程直接可见
    console.error("FeedMind 桌面应用启动失败:", err);
    app.quit();
  });
