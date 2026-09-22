import { configuredCdpPort } from "./env-bootstrap.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } from "electron";
import { readActivePort } from "./bootstrap-utils.js";
import { createDesktopLog, rotateLogIfTooLarge } from "./desktop-log.js";
import { initDesktopEncryptionKey } from "./safe-storage.js";
import {
  apiPortCheck,
  cdpPortCheck,
  dataDirCheck,
  encryptionKeyCheck,
  runStartupChecks,
  type StartupFinding,
} from "./startup-checks.js";
import type { ServerType } from "@feedmind/api/server-core";
// 静态导入：API 模块图含顶层 await，动态导入会把 esbuild 的惰性初始化拆成异步 await 链而相互死锁
import {
  startApi,
  setMarkedWindowFactory,
  setMarkedWindowDestroyer,
  waitForMemorySettled,
  shutdownDatabase,
} from "@feedmind/api/server-core";

// 主进程诊断日志：打包后 GUI 无 stdout 消费者，只有落盘才能在出问题时回溯，用户侧无感
const desktopLog = createDesktopLog(
  app.isPackaged ? path.join(app.getPath("userData"), "logs", "desktop.log") : null,
);

/** 崩溃记录：落盘 crash.log（与 desktop.log 共用 20MB 轮转）并返回消息供弹窗使用 */
function writeCrashLog(kind: string, error: unknown): string {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
  desktopLog(`[崩溃] ${kind}：${message}`);
  try {
    const crashFile = path.join(app.getPath("userData"), "logs", "crash.log");
    mkdirSync(path.dirname(crashFile), { recursive: true });
    rotateLogIfTooLarge(crashFile);
    writeFileSync(crashFile, `[${new Date().toISOString()}] ${kind}: ${message}\n`, { flag: "a" });
  } catch {
    // 写入崩溃日志失败时忽略
  }
  return message;
}

// 顶层全局未捕获异常处理，落盘并弹窗告警，避免静默退出
process.on("uncaughtException", (error) => {
  dialog.showErrorBox("FeedMind 运行时异常", writeCrashLog("Uncaught Exception", error));
});

process.on("unhandledRejection", (reason) => {
  writeCrashLog("Unhandled Rejection", reason);
});

const AGENT_MARKER = "feedmind-agent";
// Agent 页面空闲超时：LLM 步间思考可达数分钟，回收会中断进行中的会话
const AGENT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
// 渲染进程崩溃后的自动重载上限：超过则只记日志，避免重载风暴
const MAX_RENDERER_RELOADS = 3;

// 拒绝授予音视频媒体等敏感权限，防止 Chromium 额外拉起常驻媒体服务进程
const MEDIA_PERMISSIONS = new Set(["media", "mediaKeySystem", "geolocation", "notifications"]);

interface MarkedWindowEntry {
  win: BrowserWindow;
  timer: NodeJS.Timeout | null;
}

let mainWindow: BrowserWindow | null = null;
let apiServer: ServerType | null = null;
const markedWindows = new Map<string, MarkedWindowEntry>();

function getUiUrl(): string {
  const devUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devUrl) return devUrl;
  // API_PORT 由 env-bootstrap 解析并写回（已含默认值），此处不再兜底
  return `http://127.0.0.1:${String(process.env["API_PORT"])}`;
}

async function loadWithRetry(
  win: BrowserWindow,
  url: string,
  maxRetries = 15,
  intervalMs = 500,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

/** 启动自检结论逐条落日志：对用户无感的项只有日志，不干扰使用 */
function logStartupFindings(findings: StartupFinding[]): void {
  for (const finding of findings) {
    desktopLog(`[启动自检][${finding.level}] ${finding.name}：${finding.message}`);
  }
}

/** 读取实际 CDP 端口：Chromium 在 ready 前写入端口文件，启动瞬间可能尚未落盘故短暂重试 */
async function resolveCdpPort(attempts = 10, intervalMs = 200): Promise<number> {
  const sessionDataDir = app.getPath("sessionData");
  for (let i = 0; i < attempts; i++) {
    const port = readActivePort(sessionDataDir);
    if (port !== null) return port;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return 0;
}

function showOnReady(win: BrowserWindow): void {
  let shown = false;
  const doShow = () => {
    if (!shown && !win.isDestroyed()) {
      shown = true;
      win.show();
    }
  };
  win.once("ready-to-show", doShow);
  // 超时兜底显示窗口，防止特定渲染异常导致窗口未展示
  setTimeout(doShow, 5000);
}

function refreshIdleTimer(marker: string): void {
  // 仅对 agent 标记窗口应用空闲超时
  if (marker !== AGENT_MARKER) return;
  const entry = markedWindows.get(marker);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void destroyMarkedWindow(marker);
  }, AGENT_IDLE_TIMEOUT_MS);
}

// 确保标记窗口创建且页面加载完成
async function ensureMarkedWindow(marker: string): Promise<void> {
  const existing = markedWindows.get(marker);
  if (existing && !existing.win.isDestroyed()) {
    // 活跃窗口直接复用并刷新空闲定时器
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

// 窗口关闭后清理会话存储与缓存
async function destroyMarkedWindow(marker: string): Promise<void> {
  const entry = markedWindows.get(marker);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  if (!entry.win.isDestroyed()) entry.win.close();
  markedWindows.delete(marker);
  const memSession = session.fromPartition(`memory:${marker}`);
  await memSession
    .clearStorageData({
      storages: ["serviceworkers", "cachestorage", "indexdb", "localstorage", "cookies"],
    })
    .catch(() => {});
  await memSession.clearCache().catch(() => {});
}

// 定时监控主进程堆内存占用
const MEMORY_SAMPLE_MS = 5 * 60 * 1000;
const MEMORY_RISING_WARN_STREAK = 3;
const MARKED_WINDOW_MEMORY_LIMIT_MB = 1536;

function startMemoryMonitor(): void {
  let lastHeap = process.memoryUsage().heapUsed;
  let risingStreak = 0;
  setInterval(() => {
    const { rss, heapUsed } = process.memoryUsage();
    risingStreak = heapUsed > lastHeap ? risingStreak + 1 : 0;
    lastHeap = heapUsed;
    desktopLog(
      JSON.stringify({
        level: risingStreak >= MEMORY_RISING_WARN_STREAK ? "warn" : "info",
        event: "memory-sample",
        rssMB: Math.round(rss / 1024 / 1024),
        heapMB: Math.round(heapUsed / 1024 / 1024),
        risingStreak,
      }),
    );
    void checkMarkedWindowMemory();
  }, MEMORY_SAMPLE_MS);
}

async function checkMarkedWindowMemory(): Promise<void> {
  const entry = markedWindows.get(AGENT_MARKER);
  if (!entry || entry.win.isDestroyed()) return;
  const metrics = app.getAppMetrics();
  const pid = entry.win.webContents.getOSProcessId();
  const proc = metrics.find((m) => m.pid === pid);
  if (proc && proc.memory.workingSetSize > MARKED_WINDOW_MEMORY_LIMIT_MB * 1024 * 1024) {
    desktopLog(
      JSON.stringify({
        level: "warn",
        event: "marked-window-memory-limit",
        marker: AGENT_MARKER,
        workingSetMB: Math.round(proc.memory.workingSetSize / 1024 / 1024),
      }),
    );
    await destroyMarkedWindow(AGENT_MARKER);
  }
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

/**
 * 系统主题下发：页面的 prefers-color-scheme 会被 CDP 自动化（Playwright 冷接默认上下文时套用的
 * media 模拟）或 DevTools 模拟覆盖，所以“跟随系统”以主进程原生主题为准，媒体查询只作浏览器兜底。
 */
function pushSystemTheme(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  void win.webContents
    .executeJavaScript(
      `globalThis.__feedmindSystemTheme=${JSON.stringify(theme)};window.dispatchEvent(new Event("feedmind:system-theme"))`,
    )
    .catch(() => {});
}

function createMainWindow(): BrowserWindow {
  const isProd = app.isPackaged;
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    webPreferences: {
      sandbox: true,
      spellcheck: false,
      devTools: !isProd,
    },
  });
  win.removeMenu();
  win.webContents.setUserAgent(CHROME_UA);

  // 生产环境屏蔽开发者工具与刷新快捷键，避免中断对话
  if (isProd) {
    win.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i") ||
        input.key === "F5" ||
        (input.control && input.key.toLowerCase() === "r")
      ) {
        event.preventDefault();
      }
    });
  }

  // 导航守卫：拦截非本地 UI 地址并使用系统默认浏览器打开
  const handleExternalNavigation = (event: Electron.Event, targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl);
      const allowed = new URL(getUiUrl());
      if (parsed.origin !== allowed.origin) {
        event.preventDefault();
        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
          void shell.openExternal(targetUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  };

  win.webContents.on("will-navigate", handleExternalNavigation);
  win.webContents.on("will-redirect", handleExternalNavigation);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // 渲染进程异常退出（崩溃或被系统回收）后自动重载，用户侧无感；超过上限只记录，避免重载风暴
  let rendererReloads = 0;
  win.webContents.on("render-process-gone", (_event, details) => {
    desktopLog(`[渲染进程] 异常退出：reason=${details.reason} exitCode=${details.exitCode}`);
    if (rendererReloads >= MAX_RENDERER_RELOADS || win.isDestroyed()) return;
    rendererReloads += 1;
    win.reload();
  });
  win.on("closed", () => {
    mainWindow = null;
    if (process.platform !== "darwin") app.quit();
  });
  // 每次导航完成都重下发：刷新后页面全局变量会丢
  win.webContents.on("did-finish-load", () => pushSystemTheme(win));
  showOnReady(win);
  return win;
}

/** 创建标记页隐藏窗口：爬虫与 Agent 各用独立窗口，会话互不踩踏 */
async function createMarkedWindow(marker: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition: `memory:${marker}`,
      backgroundThrottling: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: "user-gesture-required",
    },
  });
  win.removeMenu();
  win.webContents.setUserAgent(CHROME_UA);
  // 标记窗口走独立 memory 分区：不注册 handler 时 Electron 会批准全部权限请求
  const markedSession = session.fromPartition(`memory:${marker}`);
  markedSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!MEDIA_PERMISSIONS.has(permission));
  });
  markedSession.setPermissionCheckHandler((_wc, permission) => !MEDIA_PERMISSIONS.has(permission));
  // 页面仍在导航说明窗口在用，顺延空闲回收，避免回收正在执行的会话
  win.webContents.on("did-start-navigation", () => {
    refreshIdleTimer(marker);
  });
  win.webContents.on("did-frame-finish-load", () => {
    refreshIdleTimer(marker);
  });
  await win.loadURL(`data:text/html,<title>${marker}</title>`);
  return win;
}

async function bootstrap(): Promise<void> {
  desktopLog("[启动] 开始初始化桌面端应用...");
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!MEDIA_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => !MEDIA_PERMISSIONS.has(permission),
  );

  // 主密钥需 app ready 后才能从保险箱解密，必须在 startApi（内部校验 ENCRYPTION_KEY）之前注入
  const dataDir = process.env["DATA_DIR"];
  const keyWarning = dataDir ? initDesktopEncryptionKey(dataDir) : null;

  // CDP 端口：读取 Chromium 实际分配端口并写入环境，失败仅记日志不打扰用户
  const cdpPort = await resolveCdpPort();
  if (cdpPort > 0) process.env["CDP_PORT"] = String(cdpPort);
  else desktopLog(`[启动] CDP 端口未就绪（配置值 ${configuredCdpPort}），浏览器自动化暂不可用`);

  // 启动自检：数据目录、主密钥、API 端口、CDP 端口统一探测与汇报（API 端口被占用时自动改用空闲端口）
  const findings = await runStartupChecks([
    dataDirCheck,
    encryptionKeyCheck(keyWarning),
    apiPortCheck,
    cdpPortCheck(configuredCdpPort),
  ]);
  logStartupFindings(findings);
  const fatal = findings.filter((finding) => finding.level === "fatal");
  if (fatal.length > 0) {
    dialog.showErrorBox(
      "FeedMind 启动自检未通过",
      fatal.map((finding) => `· ${finding.name}：${finding.message}`).join("\n\n"),
    );
    app.quit();
    return;
  }

  const webDist = process.env["VITE_DEV_SERVER_URL"]
    ? undefined
    : app.isPackaged
      ? path.join(process.resourcesPath, "web-dist")
      : path.resolve(app.getAppPath(), "../web/dist");

  desktopLog(
    `[启动] 正在启动内置 API 服务... webDist=${webDist ?? "dev-server"} apiPort=${String(process.env["API_PORT"])}`,
  );
  apiServer = await startApi({
    ...(webDist ? { webDist } : {}),
    port: Number(process.env["API_PORT"]),
  });

  setMarkedWindowFactory(ensureMarkedWindow);
  setMarkedWindowDestroyer(destroyMarkedWindow);

  desktopLog(`[启动] 创建主窗口并加载界面... targetUrl=${getUiUrl()}`);
  nativeTheme.on("updated", () => {
    if (mainWindow) pushSystemTheme(mainWindow);
  });
  mainWindow = createMainWindow();
  await loadWithRetry(mainWindow, getUiUrl());

  startMemoryMonitor();

  // 降级项等主窗口出来再汇报：无父窗口的模态框会藏在其它窗口之后，把启动卡死且用户看不到
  const degraded = findings.filter((finding) => finding.level === "degraded");
  if (degraded.length > 0) {
    void dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "FeedMind 启动自检",
      message: `检测到 ${degraded.length} 项功能降级，应用可继续使用`,
      detail: degraded.map((finding) => `· ${finding.name}：${finding.message}`).join("\n\n"),
      buttons: ["我知道了"],
    });
  }

  desktopLog("[启动] 桌面端应用启动完成！");
}

app.on("activate", () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
    void loadWithRetry(mainWindow, getUiUrl());
  }
});

// 退出前按逆序优雅关闭：等待记忆持久化、关闭 HTTP 服务并释放数据库
let isShuttingDown = false;
app.on("before-quit", (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  isShuttingDown = true;

  void (async () => {
    try {
      await waitForMemorySettled().catch(() => {});

      if (apiServer) {
        await new Promise<void>((resolve) => {
          apiServer?.close(() => resolve());
          setTimeout(resolve, 2000); // 2 秒超时兜底，防止挂起连接阻碍退出
        });
        apiServer = null;
      }

      await shutdownDatabase().catch(() => {});
    } finally {
      app.quit();
    }
  })();
});

// 单例进程锁：防止多实例并发导致端口与数据库冲突
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // 已有实例在跑时本进程静默退出，必须留下痕迹，否则表现为"双击无反应"
  desktopLog("[启动] 已存在 FeedMind 实例，本次启动退出");
  app.quit();
} else {
  // 清理上次运行留下的端口文件：调试服务若未启动，读到的陈旧端口会指向已失效的连接
  try {
    rmSync(path.join(app.getPath("sessionData"), "DevToolsActivePort"), { force: true });
  } catch {
    // 文件不存在或不可删时忽略
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((err) => {
      dialog.showErrorBox("FeedMind 桌面应用启动失败", writeCrashLog("启动失败", err));
      app.quit();
    });
}
