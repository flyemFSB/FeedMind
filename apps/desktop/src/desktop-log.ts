import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import * as path from "node:path";

const MAX_LOG_BYTES = 20 * 1024 * 1024;

/** 日志超过上限时归档为 .old，长跑用户无需手动清理也不会撑爆磁盘 */
export function rotateLogIfTooLarge(file: string, maxBytes = MAX_LOG_BYTES): void {
  try {
    if (statSync(file).size >= maxBytes) renameSync(file, `${file}.old`);
  } catch {
    // 文件不存在或不可读时无需轮转
  }
}

/** 桌面主进程诊断日志：控制台输出并持久化落盘，用于排查无终端环境问题 */
export function createDesktopLog(logFile: string | null): (message: string) => void {
  return (message) => {
    // eslint-disable-next-line no-console -- 开发期终端可见，打包后仅落盘
    console.log(message);
    if (!logFile) return;
    try {
      mkdirSync(path.dirname(logFile), { recursive: true });
      rotateLogIfTooLarge(logFile);
      appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    } catch {
      // 落盘失败不影响应用运行
    }
  };
}
