/**
 * 应用内登录处理器桥。
 *
 * API 进程内嵌于 Electron 主进程，登录窗口只能由主进程（Electron）打开，
 * standalone 模式没有桌面环境。Electron 主进程启动后调用 setLoginHandler 注册
 * 真实实现；路由层通过 getLoginHandler 判断是否可用。
 */

/** 登录结果：valid=是否捕获到登录态；cookies=捕获到的平台 Cookie 字符串 */
export interface BrowserLoginResult {
  valid: boolean;
  cookies?: string;
}

/** 打开平台登录窗口并等待用户完成登录，返回捕获的 Cookie */
export type BrowserLoginHandler = (platform: string) => Promise<BrowserLoginResult>;

let loginHandler: BrowserLoginHandler | null = null;

/** Electron 主进程注册应用内登录实现 */
export function setLoginHandler(handler: BrowserLoginHandler): void {
  loginHandler = handler;
}

/** 路由层取用；null 表示非桌面环境，应返回"请使用桌面应用" */
export function getLoginHandler(): BrowserLoginHandler | null {
  return loginHandler;
}
