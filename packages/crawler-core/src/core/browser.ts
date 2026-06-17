/**
 * AgentBrowser singleton factory and lifecycle management.
 *
 * Provides a shared AgentBrowser instance for route handlers that
 * need browser automation. Each handler should call createBrowser()
 * at the start of execution and closeBrowser() in cleanup.
 */
import { AgentBrowser } from "@mastra/agent-browser";

let _browserInstance: AgentBrowser | null = null;
let _refCount = 0;
let _pendingCreate: Promise<AgentBrowser> | null = null;

/**
 * Get or create the shared AgentBrowser instance.
 * Uses single-flight 模式确保并发调用只创建一个实例。
 */
export async function createBrowser(): Promise<AgentBrowser> {
  if (_browserInstance) {
    _refCount++;
    await _browserInstance.ensureReady();
    return _browserInstance;
  }

  // single-flight：等待正在创建中的实例
  if (_pendingCreate) {
    _refCount++;
    return _pendingCreate;
  }

  _refCount++;
  _pendingCreate = (async () => {
    const instance = new AgentBrowser({
      headless: true,
      viewport: { width: 1280, height: 720 },
      timeout: 30_000,
      scope: "thread",
      excludeTools: [],
    });
    await instance.ensureReady();
    _browserInstance = instance;
    _pendingCreate = null;
    return instance;
  })();

  return _pendingCreate;
}

/**
 * Release a reference to the shared browser.
 * When all references are released, the browser is closed.
 */
export async function closeBrowser(): Promise<void> {
  _refCount--;
  if (_refCount <= 0 && _browserInstance) {
    await _browserInstance.close();
    _browserInstance = null;
    _refCount = 0;
  }
}
