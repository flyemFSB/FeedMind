export const dbLogger = {
  info: (msg: string, ...args: unknown[]) => console.log(`[db] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[db] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[db] ${msg}`, ...args),
};
