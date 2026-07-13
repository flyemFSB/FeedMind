export const dbLogger = {
  // eslint-disable-next-line no-console
  info: (msg: string, ...args: unknown[]) => console.log(`[db] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  warn: (msg: string, ...args: unknown[]) => console.warn(`[db] ${msg}`, ...args),
  // eslint-disable-next-line no-console
  error: (msg: string, ...args: unknown[]) => console.error(`[db] ${msg}`, ...args),
};
