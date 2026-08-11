/**
 * 爬虫窗口连接工厂与生命周期管理。
 *
 * 处理器在执行开始时调用 createBrowser()，清理时调用 closeBrowser()。
 *
 * 自 Electron 化起不再自起 Chrome：通过 CDP（connectOverCDP）连接 FeedMind
 * 桌面应用内置的 Chromium 隐藏爬虫窗口。standalone 模式（无桌面应用）下爬虫不可用。
 *
 * 隔离策略：仅允许驱动 FeedMind Electron 内置 Chromium——连接后校验浏览器身份
 * （userAgent 含 "Electron"），拒绝任何指向用户主机 Chrome/其他 Chromium 的端点；
 * 并按标记选页，绝不回退驱动 UI 窗口或其他浏览器的标签页。
 *
 * 并发模型：任务互斥串行化——同一时刻只允许一个爬虫任务独占爬虫窗口，
 * 避免不同平台/任务同时驱动同一窗口互相踩踏。
 */
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

/** CDP 端点：桌面应用 --remote-debugging-port 默认 9333，可用 CDP_ENDPOINT 覆盖 */
const CDP_ENDPOINT = process.env["CDP_ENDPOINT"] ?? "http://127.0.0.1:9333";

/** 爬虫窗口标记：桌面应用以此初始化爬虫窗口，据此选页，而非依赖不可靠的 pages[0] 顺序 */
const CRAWLER_MARKER = "feedmind-crawler";

/** 爬虫窗口标记 URL（与 apps/desktop 主进程一致）：任务结束后导航回去，保证窗口随时可识别 */
const CRAWLER_URL = `data:text/html,<title>${CRAWLER_MARKER}</title>`;

// 归还窗口时导航回标记页的超时兜底：渲染进程卡死时不阻塞锁释放
const RESET_NAV_TIMEOUT = 5_000;

let _browser: Browser | null = null;
let _page: Page | null = null;
let _connecting: Promise<Page> | null = null;

// 任务互斥队列：每个 createBrowser 排队，前一个任务 closeBrowser 后释放
let _lockTail: Promise<void> = Promise.resolve();
let _releaseLock: (() => void) | null = null;

/** 清空连接缓存：连接断开、页面关闭、连接失败时调用，保证下次调用重连而非复用失效句柄 */
function resetConnection(): void {
  _browser = null;
  _page = null;
  _connecting = null;
}

// 惰性窗口工厂：桌面模式由 Electron 主进程注册"按标记创建隐藏窗口"实现；
// standalone（无桌面）为 null，补建时跳过，最终仍报"未发现窗口"提示
let _markedWindowFactory: ((marker: string) => Promise<void>) | null = null;

export function setMarkedWindowFactory(fn: (marker: string) => Promise<void>): void {
  _markedWindowFactory = fn;
}

export async function ensureMarkedWindow(marker: string): Promise<void> {
  if (_markedWindowFactory) {
    await _markedWindowFactory(marker);
  }
}

// 惰性窗口销毁器：桌面模式由 Electron 主进程注册"按标记销毁隐藏窗口"实现。
// 注册后 closeBrowser 采用"任务结束即销毁"模式（跳过归还导航，直接销毁窗口）
let _markedWindowDestroyer: ((marker: string) => Promise<void>) | null = null;

export function setMarkedWindowDestroyer(fn: (marker: string) => Promise<void>): void {
  _markedWindowDestroyer = fn;
}

// 未注册 destroyer（常驻模式）时为空操作
export async function destroyMarkedWindow(marker: string): Promise<void> {
  if (_markedWindowDestroyer) {
    await _markedWindowDestroyer(marker);
  }
}

/**
 * 建立 CDP 连接并校验确为 FeedMind Electron 内置 Chromium。
 *
 * 身份校验是硬隔离：即使 CDP_ENDPOINT 被指向用户主机 Chrome/其他 Chromium
 * （如端口被另一浏览器占用），也拒绝驱动——绝不触碰用户日常浏览器。
 */
async function connectElectron(): Promise<Browser> {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT, {
    timeout: 30_000,
    // noDefaults：跳过对默认 context 的 download/focus/media 覆盖（Electron 不支持 context 管理）
    // isLocal：明确本机连接
    noDefaults: true,
    isLocal: true,
  });
  try {
    // 用 CDP 原生接口取 userAgent 判别身份：playwright 的 browser.version() 会剥离前缀，
    // 且 Electron 43+ 的 product 已改为 "Chrome/<ver>"（不再含 "Electron"），
    // 但 userAgent 仍保留 "Electron/<ver>" 与 "FeedMind/<ver>" 标记，可作可靠判别依据
    const cdp = await browser.newBrowserCDPSession();
    const { userAgent } = (await cdp.send("Browser.getVersion")) as { userAgent: string };
    await cdp.detach().catch(() => {});
    // 系统 Chrome/Edge 的 UA 不含 "Electron"，据此拒绝驱动用户主机浏览器
    if (!userAgent.includes("Electron")) {
      throw new Error(
        `CDP 端点不是 FeedMind Electron（实际 UA: ${userAgent}），已拒绝连接以隔离用户主机浏览器`,
      );
    }
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
  return browser;
}

/** 供 Agent 浏览器等独立连接方预检：确认 CDP 端点归属 FeedMind Electron，连接后即关闭 */
let _cdpVerified = false;
export async function assertElectronCdp(): Promise<void> {
  if (_cdpVerified) return;
  const browser = await connectElectron();
  await browser.close().catch(() => {});
  _cdpVerified = true;
}

/** 建立 CDP 连接并按标记选择爬虫窗口（标记缺失时报错，绝不回退驱动 UI 窗口） */
async function ensureConnected(): Promise<Page> {
  // 缓存的页面已关闭（macOS 重建窗口）或连接已断开：清空后重连
  if (_page && (_page.isClosed() || !_browser?.isConnected())) {
    resetConnection();
  }
  if (_page) return _page;

  _connecting ??= (async () => {
    try {
      // 惰性补建：第一轮选不到爬虫窗口时请求创建，再重连重选。
      // 必须重连而非复用旧连接——CDP 对 show:false 新窗口的 target 感知不可靠
      // （Electron 14+ 不回放 Target.attachedToTarget），新连接才会枚举全部 target
      for (let attempt = 0; attempt < 2; attempt++) {
        const browser = await connectElectron();
        browser.on("disconnected", resetConnection);

        const pages = browser.contexts()[0]?.pages() ?? [];
        const selected = pages.find((p) => p.url().includes(CRAWLER_MARKER));
        if (selected) {
          // 窗口被关闭（如 macOS 重建）但 CDP 连接仍在时，同步重置缓存，下次任务重新选页
          selected.on("close", () => {
            if (_page === selected) resetConnection();
          });
          _browser = browser;
          _page = selected;
          return selected;
        }

        await browser.close().catch(() => {});
        if (attempt === 0) {
          await ensureMarkedWindow(CRAWLER_MARKER);
          // 窗口创建+加载约 45ms，留出 target 注册余量
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (err) {
      // 连接失败/标记缺失：清空缓存再抛，避免 rejected promise 毒化后续所有任务
      resetConnection();
      throw err;
    }
    resetConnection();
    throw new Error(`CDP 未发现爬虫窗口（标记 ${CRAWLER_MARKER}），请确认 FeedMind 桌面应用已启动`);
  })();
  return _connecting;
}

/**
 * 获取共享爬虫窗口的独占使用权（任务串行化）。
 * 处理器执行完后调用 closeBrowser() 释放。
 */
export async function createBrowser(): Promise<Page> {
  // 排队等待前一个任务释放，独占爬虫窗口
  const prev = _lockTail;
  const { promise, resolve: release } = Promise.withResolvers<void>();
  _lockTail = promise;
  await prev;

  try {
    const page = await ensureConnected();
    // 清理上一个任务遗留的请求拦截，避免污染本次任务
    await page.unroute("**/*").catch(() => {});
    _releaseLock = release;
    return page;
  } catch (err) {
    release();
    throw err;
  }
}

/**
 * 释放爬虫窗口独占权，允许下一个任务执行。
 * 常驻模式：归还前导航回标记页，保证随时可识别；
 * 销毁模式（注册了 destroyer）：任务结束即销毁窗口，无需归还导航，下次任务惰性补建。
 */
export async function closeBrowser(): Promise<void> {
  const destroyAfter = _markedWindowDestroyer != null;
  if (_page && !_page.isClosed() && !destroyAfter) {
    // 导航带超时：渲染进程卡死时不阻塞锁释放，避免后续任务死锁
    await Promise.race([
      _page.goto(CRAWLER_URL, { waitUntil: "domcontentloaded" }),
      new Promise((r) => setTimeout(r, RESET_NAV_TIMEOUT)),
    ]).catch(() => {});
  }
  _releaseLock?.();
  _releaseLock = null;
  if (destroyAfter) {
    await destroyMarkedWindow(CRAWLER_MARKER);
  }
}

/** 屏蔽图片/媒体/字体/样式等非关键资源，加速爬取页面加载 */
export async function blockHeavyResources(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) {
      void route.abort();
    } else {
      void route.continue();
    }
  });
}

/**
 * 将 Cookie 字符串注入到页面上下文。
 * 在 page.goto() 之前调用，使浏览器导航时携带登录态。
 *
 * @param page  - Playwright Page 对象（来自 createBrowser()）
 * @param cookieStr - Cookie 字符串，格式 "name=value; name2=value2"
 * @param domain - Cookie 所属域名，例如 ".bilibili.com"
 */
export async function injectCookies(
  page: Page,
  cookieStr: string | undefined,
  domain: string,
): Promise<void> {
  if (!cookieStr) return;

  const cookies = cookieStr
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const equalIndex = item.indexOf("=");
      if (equalIndex <= 0) return null;
      return {
        name: item.slice(0, equalIndex).trim(),
        value: item.slice(equalIndex + 1).trim(),
        domain,
        path: "/",
      };
    })
    .filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null);

  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
}

// 各平台登录态关键 Cookie 名：用于判断爬虫窗口 session 是否已有该平台登录态。
// 桌面模式下 session 是登录态权威源（应用内登录/保活续期都在其中），爬取优先直接使用。
const HOST_LOGIN_COOKIE: Record<string, string> = {
  "bilibili.com": "SESSDATA",
  "weread.qq.com": "wr_skey",
  "douyin.com": "sessionid",
  "xiaohongshu.com": "web_session",
};

/**
 * 确保页面携带平台登录 Cookie：桌面模式 session 已含该平台登录态时直接用（最新），
 * 不注入 DB 值；仅当 session 缺失（手动来源、standalone 注入）才用传入 cookie。
 *
 * @param page    - Playwright Page 对象（来自 createBrowser()）
 * @param cookies - DB cookie 串（兜底来源）
 * @param host    - 平台网站 host，如 "weread.qq.com"、"bilibili.com"
 */
export async function ensureCookies(
  page: Page,
  cookies: string | undefined,
  host: string,
): Promise<void> {
  const loginCookie = HOST_LOGIN_COOKIE[host];
  if (loginCookie) {
    const existing = await page.context().cookies([`https://${host}`]);
    if (existing.some((c) => c.name === loginCookie)) return;
  }
  await injectCookies(page, cookies, `.${host}`);
}
