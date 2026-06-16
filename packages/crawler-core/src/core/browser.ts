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

/**
 * Get or create the shared AgentBrowser instance.
 * Uses reference counting so concurrent handlers share the same browser.
 */
export async function createBrowser(): Promise<AgentBrowser> {
  if (!_browserInstance) {
    _browserInstance = new AgentBrowser({
      headless: true,
      viewport: { width: 1280, height: 720 },
      timeout: 30_000,
      scope: "thread",
      excludeTools: [],
    });
  }
  _refCount++;
  await _browserInstance.ensureReady();
  return _browserInstance;
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
