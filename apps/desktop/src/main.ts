import "./env-bootstrap.js";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { app, BrowserWindow, dialog, Menu, session, shell } from "electron";
import {
  startApi,
  setMarkedWindowFactory,
  setMarkedWindowDestroyer,
  waitForMemorySettled,
} from "@feedmind/api/server-core";

// 顶层全局未捕获异常处理，落盘 logs/crash.log 并弹窗告警，避免静默退出
process.on("uncaughtException", (error) => {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      path.join(logDir, "crash.log"),
      `[${new Date().toISOString()}] Uncaught Exception: ${message}\n`,
      { flag: "a" },
    );
  } catch {
    // 忽略写入失败
  }
  dialog.showErrorBox("FeedMind 运行时异常", message);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? `${reason.message}\n\n${reason.stack}` : String(reason);
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      path.join(logDir, "crash.log"),
      `[${new Date().toISOString()}] Unhandled Rejection: ${message}\n`,
      { flag: "a" },
    );
  } catch {
    // 忽略写入失败
  }
});

const DEFAULT_UI_PORT = 18790;
const AGENT_MARKER = "feedmind-agent";
// Agent 页面空闲超时缩短为 2 分钟，空闲即释放 Chromium 渲染子进程
const AGENT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

// 拒绝授予音视频媒体等敏感权限，防止 Chromium 额外拉起常驻媒体服务进程
const MEDIA_PERMISSIONS = new Set(["media", "mediaKeySystem", "geolocation", "notifications"]);

interface MarkedWindowEntry {
  win: BrowserWindow;
  timer: NodeJS.Timeout | null;
}

let mainWindow: BrowserWindow | null = null;
const markedWindows = new Map<string, MarkedWindowEntry>();

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
  let shown = false;
  const doShow = () => {
    if (!shown && !win.isDestroyed()) {
      shown = true;
      win.show();
    }
  };
  win.once("ready-to-show", doShow);
  // 5 秒超时兜底：防止因特定渲染/GPU卡顿错过 ready-to-show 事件导致窗口永久隐藏
  setTimeout(doShow, 5000);
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

// 窗口关闭后清理纯内存会话存储与缓存
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
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    webPreferences: { sandbox: true, spellcheck: false },
  });
  win.removeMenu();
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
  await win.loadURL(`data:text/html,<title>${marker}</title>`);
  return win;
}

async function bootstrap(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[启动] 开始初始化桌面端应用...");
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(!MEDIA_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => !MEDIA_PERMISSIONS.has(permission),
  );

  const webDist = process.env["VITE_DEV_SERVER_URL"]
    ? undefined
    : app.isPackaged
      ? path.join(process.resourcesPath, "web-dist")
      : path.resolve(app.getAppPath(), "../web/dist");

  // eslint-disable-next-line no-console
  console.log("[启动] 正在启动内置 API 服务...", { webDist: webDist ?? "dev-server" });
  await startApi(webDist ? { webDist } : {});

  setMarkedWindowFactory(ensureMarkedWindow);
  setMarkedWindowDestroyer(destroyMarkedWindow);

  // eslint-disable-next-line no-console
  console.log("[启动] 创建主窗口并加载界面...", { targetUrl: getUiUrl() });
  mainWindow = createMainWindow();
  await loadWithRetry(mainWindow, getUiUrl());

  startMemoryMonitor();
  // eslint-disable-next-line no-console
  console.log("[启动] 桌面端应用启动完成！");
}

app.on("activate", () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
    void loadWithRetry(mainWindow, getUiUrl());
  }
});

// 退出前等待 Observational Memory 后台观察/反射周期写完 mastra.db，防止后台写被进程退出截断。
let memoryFlushed = false;
app.on("before-quit", (event) => {
  if (memoryFlushed) return;
  event.preventDefault();
  void waitForMemorySettled()
    .catch(() => {})
    .finally(() => {
      memoryFlushed = true;
      app.quit();
    });
});

// 单例锁：防止多开导致 API 端口 (18790) / CDP 端口 (9333) 与 SQLite 冲突
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
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
      // eslint-disable-next-line no-console -- 启动失败需在控制台可见
      console.error("FeedMind 桌面应用启动失败:", err);
      const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err);
      dialog.showErrorBox("FeedMind 桌面应用启动失败", message);
      app.quit();
    });
}
