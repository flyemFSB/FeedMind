import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { enableCompileCache } from "node:module";
import * as path from "node:path";
import { app } from "electron";

// Node.js 22+ 原生编译字节码缓存：跳过重复模块解析编译，减少冷启动堆内存与耗时
try {
  enableCompileCache();
} catch {
  // 忽略低版本或不支持的环境
}

// 设置标准应用名称，规范化 Electron userData 存储路径为 %APPDATA%/FeedMind
app.setName("FeedMind");

const DEFAULT_CDP_PORT = 9333;

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

// 生产模式加载 resources/.env；开发模式加载仓库根目录 .env
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, ".env")
  : path.resolve(app.getAppPath(), "../../.env");
try {
  process.loadEnvFile(envPath);
} catch {
  // .env 文件可选
}

// 生产打包或未显式指定数据目录时，默认绑定系统用户数据目录（%APPDATA%\FeedMind\data）
// 彻底解耦只读 asar 归档与可写数据库/Wiki/日志文件系统
const dataDir =
  process.env["DATA_DIR"] ??
  (app.isPackaged
    ? path.join(app.getPath("userData"), "data")
    : path.resolve(app.getAppPath(), "../../data"));
process.env["DATA_DIR"] = dataDir;
process.env["DATABASE_PATH"] = process.env["DATABASE_PATH"] ?? path.join(dataDir, "feedmind.db");
process.env["WIKI_DIR"] = process.env["WIKI_DIR"] ?? path.join(dataDir, "wiki");
try {
  mkdirSync(dataDir, { recursive: true });
} catch {
  // 目录已存在按需忽略
}

// 敏感信息加解密密钥：若环境未配置，在数据目录安全持久化随机密钥（实现桌面端零配置开箱即用）
if (!process.env["ENCRYPTION_KEY"]) {
  const keyFile = path.join(dataDir, ".secret_key");
  try {
    process.env["ENCRYPTION_KEY"] = readFileSync(keyFile, "utf-8").trim();
  } catch {
    const key = randomBytes(32).toString("hex");
    try {
      writeFileSync(keyFile, key, "utf-8");
    } catch {
      // 忽略写入失败
    }
    process.env["ENCRYPTION_KEY"] = key;
  }
}

// 生产打包下显式声明生产环境并关闭非原生 pretty logger
if (app.isPackaged) {
  process.env["NODE_ENV"] = "production";
  process.env["APP_ENV"] = process.env["APP_ENV"] ?? "production";
  process.env["LOG_PRETTY"] = "0";
}

// 开发模式下默认指向 web dev 服务器（避免依赖 cross-env 传参）
if (!app.isPackaged && !process.env["VITE_DEV_SERVER_URL"]) {
  process.env["VITE_DEV_SERVER_URL"] = "http://127.0.0.1:13790";
}

const cdpPort = getCdpPort();
app.commandLine.appendSwitch("remote-debugging-port", String(cdpPort));
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");

// V8 Code Cache 与 GC 暴露支持：方便后台大任务后主动释放堆内存
app.commandLine.appendSwitch("v8-cache-options", "code");
app.commandLine.appendSwitch("js-flags", "--expose-gc");

// 2D 画布离屏光栅化：将图表与画布计算卸载至 GPU 显存，减少主渲染进程 RAM 峰值
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");

// 精简 GPU 显存与后台开销：禁用非必要视频叠加与背景检测轮询，降低 GPU 进程 Working Set
app.commandLine.appendSwitch("disable-gpu-memory-buffer-video-frames");
app.commandLine.appendSwitch("disable-direct-composition-video-overlays");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-domain-reliability");

// 禁用无用的 Google 翻译服务、投屏发现、智能优化提示等，减少网络进程与渲染进程基线占用
app.commandLine.appendSwitch(
  "disable-features",
  "Translate,MediaRouter,DialMediaRouteProvider,OptimizationHints,CalculateNativeWinOcclusion",
);

// 限制渲染子进程并发上限为 2，防止并发打开过多 Tab 导致物理 RAM 激增
app.commandLine.appendSwitch("renderer-process-limit", "2");
