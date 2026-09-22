/** 桌面端启动自检模块：探测端口、密钥与数据目录等启动期关键资源状态 */
import { createServer } from "node:net";

export type CheckLevel = "ok" | "degraded" | "fatal";

/** 检查结论：名称由 StartupCheck 提供 */
export interface Finding {
  level: CheckLevel;
  /** 面向用户的结论与下一步 */
  message: string;
}

export interface StartupCheck {
  name: string;
  run(): Promise<Finding> | Finding;
}

export interface StartupFinding extends Finding {
  name: string;
}

/** 端口探测：空闲时返回该端口；被占用返回 null；传 0 时由系统分配空闲端口 */
export function probeFreePort(preferred: number): Promise<number | null> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(null));
    probe.once("listening", () => {
      const address = probe.address();
      probe.close(() => resolve(address && typeof address === "object" ? address.port : 0));
    });
    probe.listen(preferred, "127.0.0.1");
  });
}

/** 数据目录：主进程必须已注入，否则数据库与 Wiki 无处落盘 */
export const dataDirCheck: StartupCheck = {
  name: "数据目录",
  run: () => {
    const dir = process.env["DATA_DIR"];
    return dir
      ? { level: "ok", message: dir }
      : {
          level: "fatal",
          message: "DATA_DIR 未注入，无法定位数据库与 Wiki；环境初始化异常，请重新安装或反馈该问题",
        };
  },
};

/** 主密钥：与数据目录既有密文不一致时，已加密凭据将无法解密 */
export function encryptionKeyCheck(warning: string | null): StartupCheck {
  return {
    name: "主密钥",
    run: () =>
      warning
        ? {
            level: "degraded",
            message: `${warning}\n请在 .env 中恢复原 ENCRYPTION_KEY，或删除数据目录下的 .secret_key.enc 后重新配置模型凭据`,
          }
        : { level: "ok", message: "与数据目录一致" },
  };
}

/** 内置 API 端口：被占用时自动改用系统分配的空闲端口，UI 与回调地址都由本进程推导，对用户无感 */
export const apiPortCheck: StartupCheck = {
  name: "内置 API 端口",
  run: async () => {
    const preferred = Number(process.env["API_PORT"]);
    const port = (await probeFreePort(preferred)) ?? (await probeFreePort(0));
    if (port === null) {
      return { level: "fatal", message: `端口 ${preferred} 与系统分配端口均不可用` };
    }
    if (port !== preferred) {
      process.env["API_PORT"] = String(port);
      return { level: "ok", message: `端口 ${preferred} 已被占用，已自动改用空闲端口 ${port}` };
    }
    return { level: "ok", message: `监听 127.0.0.1:${port}` };
  },
};

/** CDP 端口归属判定：校验 /json/version 中 Electron UA 与版本是否与本应用一致 */
export function detectForeignCdpOwner(
  payload: unknown,
  expectedElectronVersion: string,
): string | null {
  const record =
    typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  const userAgent = record ? String(record["User-Agent"] ?? "") : "";
  if (!userAgent) return "CDP 端口返回了无法识别的响应";
  if (!userAgent.includes("Electron")) return `CDP 端口已被其它浏览器占用（${userAgent}）`;
  if (!userAgent.includes(`Electron/${expectedElectronVersion}`)) {
    return `CDP 端口已被其它 Electron 应用占用（${userAgent}）`;
  }
  return null;
}

/** CDP 端口：系统自动分配（0）时无需检查；显式指定固定端口时校验归属，避免连到外部浏览器实例 */
export function cdpPortCheck(explicitPort: number): StartupCheck {
  return {
    name: "CDP 端口",
    run: async () => {
      if (explicitPort === 0) {
        return { level: "ok", message: "由系统自动分配，不与他人占用冲突" };
      }
      const port = String(explicitPort);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(1500),
        });
        const message = detectForeignCdpOwner(
          await response.json(),
          process.versions["electron"] ?? "",
        );
        return message
          ? {
              level: "degraded",
              message: `${message}\n取消 CDP_PORT 配置即可改由系统自动分配空闲端口`,
            }
          : { level: "ok", message: `由本应用占用 ${port}` };
      } catch {
        // 端口空闲（本机 Chromium 尚未绑定）属正常情况
        return { level: "ok", message: `空闲 ${port}` };
      }
    },
  };
}

export async function runStartupChecks(checks: StartupCheck[]): Promise<StartupFinding[]> {
  return Promise.all(
    checks.map(async (check) => {
      try {
        return { name: check.name, ...(await check.run()) };
      } catch (err) {
        // 检查自身异常按致命处理：宁可启动失败，也不要在资源未知的情况下继续
        return {
          name: check.name,
          level: "fatal" as const,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}
