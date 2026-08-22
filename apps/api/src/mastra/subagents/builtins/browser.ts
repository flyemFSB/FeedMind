import { AgentBrowser } from "@mastra/agent-browser";
import { assertElectronCdp, ensureMarkedWindow } from "@feedmind/crawler-core";
import { buildSystemPrompt } from "../../prompts/system.js";
import type { SubagentTemplate } from "../../tools/task.js";

/**
 * AgentBrowser 实例（通过 CDP 连接桌面应用内置 Chromium）
 * 懒初始化：直到第一次 getTools() 调用时才建立连接，
 * 避免应用启动时即初始化浏览器（造成不必要的资源占用）。
 */
let _browserInstance: AgentBrowser | null = null;

/** CDP 端点：桌面应用 --remote-debugging-port 默认 9333，可用 CDP_ENDPOINT 覆盖 */
const CDP_ENDPOINT = process.env["CDP_ENDPOINT"] ?? "http://127.0.0.1:9333";

/** Agent 浏览器窗口标记：与 apps/desktop 主进程一致（feedmind-agent） */
const AGENT_MARKER = "feedmind-agent";

let _hasLocatedAgentWindow = false;

/**
 * 定位并激活 Agent 浏览器窗口。
 * 仅在首次启动或 tab 丢失时按 marker 初始化定位；一旦定位成功并导航到目标 URL，
 * 后续操作直接在该 tab 执行，避免因目标 URL 不含 marker 而误判。
 */
async function activateAgentWindow(instance: AgentBrowser): Promise<void> {
  const manager = await instance.getManagerForThread();
  await ensureMarkedWindow(AGENT_MARKER);

  if (_hasLocatedAgentWindow) {
    // 已经锁定 agent 窗口，只需维持心跳
    return;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const tabs = await manager.listTabs();
    const idx = tabs.findIndex((t) => t.url.includes(AGENT_MARKER));
    if (idx >= 0) {
      if (!tabs[idx]!.active) {
        await manager.switchTo(idx);
      }
      _hasLocatedAgentWindow = true;
      return;
    }
    if (attempt === 0) {
      await ensureMarkedWindow(AGENT_MARKER);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // 兜底：若所有 tab 都未带 marker，且当前活跃 tab 不是 UI 主窗口（index > 0），则复用当前
  const tabs = await manager.listTabs();
  if (tabs.length > 1) {
    _hasLocatedAgentWindow = true;
    return;
  }

  throw new Error(
    `CDP 未发现 Agent 浏览器窗口（标记 ${AGENT_MARKER}），请确认 FeedMind 桌面应用已启动`,
  );
}

function getBrowserInstance(): AgentBrowser {
  _browserInstance ??= (() => {
    const instance = new AgentBrowser({
      cdpUrl: CDP_ENDPOINT,
      scope: "shared",
      viewport: { width: 1280, height: 720 },
      timeout: 30_000,
      excludeTools: [],
    });

    const originalEnsureReady = instance.ensureReady.bind(instance);
    instance.ensureReady = async () => {
      await assertElectronCdp();
      await originalEnsureReady();
      await activateAgentWindow(instance);
    };
    return instance;
  })();
  return _browserInstance;
}

/**
 * 浏览器自动化 subagent 模板。
 * 提供 16 个基于 Playwright + 无障碍树 refs 的浏览器工具。
 */
export const browserTemplate: SubagentTemplate = {
  type: "browser",
  name: "Browser",
  description:
    "浏览器自动化 agent，用于需要打开网页、点击按钮、填写表单、提取页面内容等浏览器交互任务。当你需要访问需要 JavaScript 渲染的页面、进行登录操作、或者需要精确的页面元素交互时，使用此类型。返回页面文本内容或截图。",

  getInstructions() {
    return buildSystemPrompt(`你是 FeedMind 浏览器自动化助手。

你的核心能力是通过浏览器工具与网页交互。

## 可用浏览器工具

- browser_goto — 导航到指定 URL
- browser_snapshot — 获取当前页面的无障碍树快照及元素 refs（如 @e1, @e2）
- browser_click — 点击指定 ref 的元素
- browser_type — 向指定 ref 的元素输入文本
- browser_press — 按下键盘按键
- browser_select — 选择下拉选项
- browser_scroll — 滚动页面或元素
- browser_hover — 悬停在元素上
- browser_back — 返回上一页
- browser_screenshot — 截取当前页面截图（返回 PNG，视觉模型可理解）
- browser_wait — 等待元素状态变化
- browser_tabs — 管理浏览器标签页（列出、新建、切换、关闭）
- browser_dialog — 处理浏览器对话框（alert/confirm/prompt）
- browser_drag — 拖放元素
- browser_evaluate — 在页面中执行 JavaScript（逃生舱）
- browser_close — 关闭浏览器

## 交互模式

1. 使用 browser_goto 导航到目标页面
2. 使用 browser_snapshot 获取页面无障碍树快照，查看元素 refs
3. 根据 refs 选择目标元素进行交互（点击、输入等）
4. 每次操作后使用 browser_snapshot 验证结果
5. 如需视觉检查（布局、颜色、图片），使用 browser_screenshot

## 规则
- 不编造来源；搜索无可用结果时，说明依据不是搜索结果。
- 回答清晰、结构化、可执行。
- 如遇到登录墙或验证码，如实告知用户无法继续。`);
  },

  getTools() {
    return getBrowserInstance().getTools() as Record<string, unknown>;
  },

  getBrowser() {
    return getBrowserInstance();
  },

  maxSteps: 20,
};
