import "./env-bootstrap.js";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { app, BrowserWindow, dialog, Menu, session, shell } from "electron";
import { initDesktopEncryptionKey } from "./safe-storage.js";
import type { ServerType } from "@feedmind/api/server-core";
import {
  startApi,
  setMarkedWindowFactory,
  setMarkedWindowDestroyer,
  waitForMemorySettled,
  shutdownDatabase,
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
    // 写入崩溃日志失败时忽略
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
    // 写入崩溃日志失败时忽略
  }
});

const DEFAULT_UI_PORT = 18790;
const AGENT_MARKER = "feedmind-agent";
// Agent 页面空闲超时时间，超时释放渲染子进程
const AGENT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;

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

  // 初始化操作系统安全存储主密钥
  const dataDir = process.env["DATA_DIR"] ?? path.join(app.getPath("userData"), "data");
  initDesktopEncryptionKey(dataDir);

  const webDist = process.env["VITE_DEV_SERVER_URL"]
    ? undefined
    : app.isPackaged
      ? path.join(process.resourcesPath, "web-dist")
      : path.resolve(app.getAppPath(), "../web/dist");

  // eslint-disable-next-line no-console
  console.log("[启动] 正在启动内置 API 服务...", { webDist: webDist ?? "dev-server" });
  try {
    apiServer = await startApi(webDist ? { webDist } : {});
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error && error.code === "EADDRINUSE") {
      const port = process.env["API_PORT"] ?? DEFAULT_UI_PORT;
      dialog.showErrorBox(
        "FeedMind 端口冲突",
        `本地端口 ${port} 已被占用，导致内置服务无法启动。\n\n请检查是否有已在运行的 FeedMind 进程或其他本地服务占用了该端口，关闭后重试。`,
      );
      app.quit();
      return;
    }
    throw err;
  }

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
