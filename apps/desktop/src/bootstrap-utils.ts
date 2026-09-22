import { readFileSync } from "node:fs";
import * as path from "node:path";

export function resolveDesktopDataDir(options: {
  isPackaged: boolean;
  userDataPath: string;
  appPath: string;
  envDataDir?: string | undefined;
}): string {
  if (options.envDataDir) return options.envDataDir;
  return options.isPackaged
    ? path.join(options.userDataPath, "data")
    : path.resolve(options.appPath, "../../data");
}

/** 解析 DevToolsActivePort 文件首行（Chromium 写入的实际监听端口） */
export function parseActivePort(text: string): number | null {
  const port = Number.parseInt(text.split(/\r?\n/, 1)[0]?.trim() ?? "", 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

/** 读取系统自动分配的 CDP 端口；文件缺失（调试服务未启动）返回 null */
export function readActivePort(sessionDataDir: string): number | null {
  try {
    return parseActivePort(readFileSync(path.join(sessionDataDir, "DevToolsActivePort"), "utf-8"));
  } catch {
    // 端口文件不存在或不可读时返回 null
    return null;
  }
}
