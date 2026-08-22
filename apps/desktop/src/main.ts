import { app, BrowserWindow, session, shell } from "electron";
import * as path from "node:path";
import { config as loadDotenv } from "dotenv";

const DEFAULT_CDP_PORT = 9333;
const DEFAULT_UI_PORT = 18790;
const AGENT_MARKER = "feedmind-agent";
const AGENT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// 拒授媒体权限防常驻媒体进程
const MEDIA_PERMISSIONS = new Set(["media", "mediaKeySystem", "geolocation", "notifications"]);

interface MarkedWindowEntry {
  win: BrowserWindow;
  timer: NodeJS.Timeout | null;
}

let mainWindow: BrowserWindow | null = null;
const markedWindows = new Map<string, MarkedWindowEntry>();

function getCdpPort(): number {
  const envPort = process.env["CDP_PORT"];
  if (envPort) {
    const parsed = Number.parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_CDP_PORT;
}

function prepareEnv(): void {
  // 生产模式加载 resources/.env；开发模式加载仓库根目录 .env
  const envPath = app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.resolve(app.getAppPath(), "../../.env");
  loadDotenv({ path: envPath });

  const cdpPort = getCdpPort();
  app.commandLine.appendSwitch("remote-debugging-port", String(cdpPort));
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");

  // 降低 Chromium 后台内存占用
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  app.commandLine.appendSwitch("disable-breakpad");
}

function getUiUrl(): string {
  const devUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devUrl) return devUrl;
  const port = process.env["API_PORT"]
    ? Number.parseInt(process.env["API_PORT"], 10)
    : DEFAULT_UI_PORT;
  return `http://127.0.0.1:${port}`;
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

function showOnReady(win: BrowserWindow): void {
  win.once("ready-to-show", () => win.show());
}

function refreshIdleTimer(marker: string): void {
  // 仅对 agent 窗口应用空闲超时：crawler 窗口由任务生命周期显式销毁
  if (marker !== AGENT_MARKER) return;
  const entry = markedWindows.get(marker);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    void destroyMarkedWindow(marker);
  }, AGENT_IDLE_TIMEOUT_MS);
}

// 补建后必须等加载完成再返回：crawler-core 按窗口 URL 标记选页
async function ensureMarkedWindow(marker: string): Promise<void> {
  const existing = markedWindows.get(marker);
  if (existing && !existing.win.isDestroyed()) {
    // 活跃窗口直接复用并刷新空闲定时器，切勿因已导航到目标 URL 而强制重载空白页
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
  await session.defaultSession
    .clearStorageData({
      storages: ["serviceworkers", "cachestorage", "indexdb", "localstorage"],
    })
    .catch(() => {});
  await session.defaultSession.clearCache().catch(() => {});
}

// 长跑内存监控：每 5 分钟采样主进程堆占用
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
    // eslint-disable-next-line no-console -- 诊断日志，desktop 主进程无 pino 基础设施
    console.log(
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
    // eslint-disable-next-line no-console -- 诊断日志，desktop 主进程无 pino 基础设施
    console.log(
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
  win.webContents.setUserAgent(CHROME_UA);
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
      autoplayPolicy: "user-gesture-required",
    },
  });
  win.webContents.setUserAgent(CHROME_UA);
  await win.loadURL(`data:text/html,<title>${marker}</title>`);
  return win;
}

async function bootstrap(): Promise<void> {
  prepareEnv();

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!MEDIA_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => !MEDIA_PERMISSIONS.has(permission),
  );

  const { startApi, setMarkedWindowFactory, setMarkedWindowDestroyer } =
    await import("@feedmind/api/server-core");

  const webDist = process.env["VITE_DEV_SERVER_URL"]
    ? undefined
    : app.isPackaged
      ? path.join(process.resourcesPath, "web-dist")
      : path.resolve(app.getAppPath(), "../web/dist");
  await startApi(webDist ? { webDist } : {});

  setMarkedWindowFactory(ensureMarkedWindow);
  setMarkedWindowDestroyer(destroyMarkedWindow);

  mainWindow = createMainWindow();
  await loadWithRetry(mainWindow, getUiUrl());

  startMemoryMonitor();
}

app.on("activate", () => {
  if (mainWindow === null) {
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
