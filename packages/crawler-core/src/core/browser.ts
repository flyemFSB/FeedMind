/**
 * 爬虫浏览器生命周期管理（CDP 桥接模式）。
 *
 * 架构决策：不再自行拉起独立的 Chromium 进程，而是通过 Chrome DevTools Protocol
 * （CDP）连接应用内置的 Chromium 内核。
 *
 * 安全边界：
 * - 拒绝驱动用户日常使用的外部浏览器（Chrome/Edge 等），仅连接应用内置实例；
 * - 仅操作带有特定标记（`feedmind-crawler`）的内部页面，绝不触碰主 UI 窗口；
 * - 任务之间串行化执行（互斥锁），避免多任务并发操作同一页面产生冲突。
 */
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

const DEFAULT_CDP_PORT = 9333;
const CRAWLER_MARKER = "feedmind-crawler";
const CRAWLER_URL = `data:text/html,<title>${CRAWLER_MARKER}</title>`;
const RESET_NAV_TIMEOUT = 5000;

function getCdpEndpoint(): string {
  if (process.env["CDP_ENDPOINT"]) {
    return process.env["CDP_ENDPOINT"];
  }
  const port = process.env["CDP_PORT"]
    ? Number.parseInt(process.env["CDP_PORT"], 10)
    : DEFAULT_CDP_PORT;
  return `http://127.0.0.1:${port}`;
}

const CDP_ENDPOINT = getCdpEndpoint();

let _browser: Browser | null = null;
let _page: Page | null = null;
let _connecting: Promise<Page> | null = null;

let _lockTail: Promise<void> = Promise.resolve();
let _releaseLock: (() => void) | null = null;

export type MarkedWindowFactory = (marker: string) => Promise<void>;
export type MarkedWindowDestroyer = (marker: string) => Promise<void>;

let _markedWindowFactory: MarkedWindowFactory | null = null;
let _markedWindowDestroyer: MarkedWindowDestroyer | null = null;

export function setMarkedWindowFactory(factory: MarkedWindowFactory): void {
  _markedWindowFactory = factory;
}

export function setMarkedWindowDestroyer(destroyer: MarkedWindowDestroyer): void {
  _markedWindowDestroyer = destroyer;
}

function resetConnection(): void {
  _browser = null;
  _page = null;
  _connecting = null;
}

export async function ensureMarkedWindow(marker: string): Promise<void> {
  if (_markedWindowFactory) {
    await _markedWindowFactory(marker);
  }
}

export async function destroyMarkedWindow(marker: string): Promise<void> {
  if (_markedWindowDestroyer) {
    await _markedWindowDestroyer(marker);
  }
}

async function connectElectron(): Promise<Browser> {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT, {
    timeout: 30_000,
    noDefaults: true,
    isLocal: true,
  });
  try {
    const cdp = await browser.newBrowserCDPSession();
    const { userAgent } = (await cdp.send("Browser.getVersion")) as { userAgent: string };
    await cdp.detach().catch(() => {});
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

let _cdpVerified = false;
export async function assertElectronCdp(): Promise<void> {
  if (_cdpVerified) return;
  const browser = await connectElectron();
  await browser.close().catch(() => {});
  _cdpVerified = true;
}

async function ensureConnected(): Promise<Page> {
  if (_page && (_page.isClosed() || !_browser?.isConnected())) {
    resetConnection();
  }
  if (_page) return _page;

  _connecting ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const browser = await connectElectron();
        browser.on("disconnected", resetConnection);

        const pages = browser.contexts()[0]?.pages() ?? [];
        const selected = pages.find((p) => p.url().includes(CRAWLER_MARKER));
        if (selected) {
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
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (err) {
      resetConnection();
      throw err;
    }
    resetConnection();
    throw new Error(`CDP 未发现爬虫窗口（标记 ${CRAWLER_MARKER}），请确认 FeedMind 桌面应用已启动`);
  })();
  return _connecting;
}

export async function createBrowser(): Promise<Page> {
  const prev = _lockTail;
  const { promise, resolve: release } = Promise.withResolvers<void>();
  _lockTail = promise;
  await prev;

  try {
    const page = await ensureConnected();
    await page.unroute("**/*").catch(() => {});
    _releaseLock = release;
    return page;
  } catch (err) {
    release();
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  const destroyAfter = _markedWindowDestroyer != null;
  if (_page && !_page.isClosed() && !destroyAfter) {
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

const HOST_LOGIN_COOKIE: Record<string, string> = {
  "bilibili.com": "SESSDATA",
  "weread.qq.com": "wr_skey",
  "douyin.com": "sessionid",
  "xiaohongshu.com": "web_session",
};

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
