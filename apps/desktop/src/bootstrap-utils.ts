import * as path from "node:path";

export const DEFAULT_CDP_PORT = 9333;

export function parseCdpPort(envPort: string | undefined): number {
  if (envPort) {
    const parsed = Number.parseInt(envPort, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_CDP_PORT;
}

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
