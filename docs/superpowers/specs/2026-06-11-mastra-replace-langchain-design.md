# FeedMind Mastra 替换 LangChain 迁移设计

日期：2026-06-11

## 1. 目标

将 FeedMind 当前的 `LangChain.js + LangGraph` Agent 链路完整替换为 `Mastra`，同时满足以下约束：

- 功能保持不变，可继续使用
- 优先采用最新官方文档中的现成功能与推荐接法
- 代码改动尽量少，方便 review
- 不添加无谓的兜底逻辑与兼容层
- 结构高内聚低耦合
- 保留必要的中文注释
- 完成后可执行针对修改部分的 code review、类型检查、测试与手工回归

## 2. 当前现状

当前系统的核心聊天链路如下：

```text
apps/web
  assistant-ui primitives
  -> @assistant-ui/react-langgraph
  -> @langchain/langgraph-sdk
  -> /api/agent 代理

apps/agent
  LangChain createAgent
  + LangGraph server / threads / history / checkpoint
  + @langchain/core tools

apps/api
  会话快照保存
  模型配置
  Wiki / crawler / tools 配置
```

当前真正与 LangGraph 深度耦合的地方有两处：

1. `apps/web/lib/api/agent.ts`
   直接依赖 `threads.create/getState/getHistory/checkpoint`
2. `apps/web/lib/assistant-runtime/provider.tsx`
   直接使用 `useLangGraphRuntime`

当前的会话持久化仍是“快照式保存”，并不是完整的消息树，因此只是“看起来支持分支”，本质上依赖 LangGraph 的 checkpoint 语义。

## 3. 官方模块优先原则

本次迁移遵守以下原则：

### 3.1 必须优先直接使用的官方模块

Mastra：

- `Agent`
- `createTool`
- `RequestContext`
- `@mastra/hono`
- `@mastra/ai-sdk`
- `chatRoute`

assistant-ui：

- `@assistant-ui/react-ai-sdk`
- `useChatRuntime`
- `AssistantChatTransport`
- `RemoteThreadListAdapter`
- `ThreadHistoryAdapter`
- `RuntimeAdapterProvider`
- `BranchPickerPrimitive`

### 3.2 只有官方没有时才自定义

必须自定义的只有业务持久化层：

- 线程列表 API
- 消息树持久化
- 当前分支头结点 `headId`
- 会话标题策略

### 3.3 明确不采用的做法

- 不伪造 LangGraph 协议
- 不在 `apps/web` 中手写聊天 runtime
- 不把线程历史交给 Mastra Memory
- 不引入额外的兼容 shim 去模拟 checkpoint API

## 4. 目标架构

迁移后职责边界如下：

### 4.1 `apps/agent`

只负责：

- Agent 推理
- Tool 调用
- 流式输出
- 读取请求上下文中的模型 ID，并动态解析模型

不负责：

- 线程列表
- 会话历史
- 分支树
- 标题生成
- 聊天业务持久化

### 4.2 `apps/api`

只负责：

- 会话列表
- 会话元数据
- assistant-ui 历史仓库
- 分支树持久化
- 当前 `headId`

### 4.3 `apps/web`

只负责：

- assistant-ui UI
- runtime 接入
- transport
- thread list adapter
- history adapter
- 模型选择状态与运行中状态

### 4.4 目标链路

```text
apps/web
  @assistant-ui/react-ai-sdk
  useChatRuntime
  AssistantChatTransport
  useRemoteThreadListRuntime
  RuntimeAdapterProvider(history)
  -> /api/agent/chat/feedmind

apps/agent
  Mastra Agent
  Mastra Tool
  RequestContext(modelId, sessionId)
  -> AI SDK stream

apps/api
  /api/v1/chats
  /api/v1/chats/:id/history
  持久化 assistant-ui message repository
```

## 5. 依赖替换

### 5.1 `apps/agent`

删除：

- `langchain`
- `@langchain/core`
- `@langchain/langgraph`
- `@langchain/langgraph-checkpoint`
- `@langchain/openai`
- `@langchain/langgraph-cli`

新增：

- `@mastra/core`
- `@mastra/hono`
- `@mastra/ai-sdk`
- `ai`
- `@ai-sdk/openai`

### 5.2 `apps/web`

删除：

- `@assistant-ui/react-langgraph`
- `@langchain/langgraph-sdk`

新增：

- `@assistant-ui/react-ai-sdk`
- `ai`

## 6. 模块映射

### 6.1 Agent 定义映射

当前：

- `createAgent`
- `middleware`
- `systemPrompt`
- `tools: StructuredToolInterface[]`

迁移后：

- `new Agent`
- `instructions`
- `model: ({ requestContext }) => ...`
- `tools: Record<string, Tool>`

### 6.2 Tool 映射

当前：

- `@langchain/core/tools tool()`

迁移后：

- `createTool()`

要求：

- 保留工具业务逻辑
- 保留输入输出 schema
- 不引入新的兼容壳

### 6.3 模型运行时映射

当前：

- `createModelRuntimeMiddleware()`
- `runtime.configurable.model`
- `initChatModel`

迁移后：

- `RequestContext`
- `x-feedmind-model-id`
- `resolveRuntimeModel(modelId)`
- `@ai-sdk/openai` 动态 provider

### 6.4 流式输出映射

当前：

- LangGraph event stream
- `messages-tuple / updates / custom`

迁移后：

- Mastra `chatRoute`
- AI SDK stream
- assistant-ui 官方 AI SDK runtime

## 7. 目标文件结构

### 7.1 `apps/agent`

```text
apps/agent/
  src/
    app.ts
    server.ts
    env.ts
    prompts/
      system.ts
    models/
      resolve-runtime-model.ts
    mastra/
      index.ts
      agents/
        feedmind-agent.ts
      tools/
        ask-clarification.ts
        web-fetch.ts
        web-search.ts
        wiki-read.ts
        wiki-search.ts
```

### 7.2 `apps/web`

```text
apps/web/
  lib/
    assistant-runtime/
      provider.tsx
      chat-transport.ts
      history-adapter.ts
      thread-list-adapter.ts
      model-state.ts
      agent-running.ts
```

### 7.3 `apps/api`

保留现有 `modules/chats`，但将实现改为：

- thread list
- history repository
- message tree persistence

## 8. 数据模型设计

继续复用当前两张表，不新增独立第三张表。

### 8.1 `chat_sessions`

保留：

- `id`
- `agent_thread_id`
- `title`
- `pinned`
- `message_count`
- `last_message_at`
- `created_at`
- `updated_at`

新增：

- `head_message_id`

### 8.2 `chat_messages`

保留：

- `id`
- `session_id`
- `agent_message_id`
- `role`
- `status`
- `model`
- `metadata`
- `created_at`
- `updated_at`

新增：

- `parent_message_id`
- `message_json`
- `run_config_json`

### 8.3 存储原则

- `message_json` 存 assistant-ui `ThreadMessage` 的完整 JSON
- `parent_message_id` 表示消息树结构
- `head_message_id` 表示当前激活分支
- 不再用“旧消息标记 failed/inactive”的方式伪装分支

## 9. API 契约

### 9.1 线程列表

#### `POST /api/v1/chats`

创建空会话。

请求：

```json
{
  "title": null
}
```

响应：

```json
{
  "id": "session_01",
  "agent_thread_id": "session_01",
  "title": "新会话",
  "pinned": false,
  "message_count": 0,
  "last_message_at": null,
  "updated_at": "2026-06-11T23:30:00.000Z"
}
```

#### `GET /api/v1/chats`

返回会话列表。

#### `DELETE /api/v1/chats/:sessionId`

删除会话。

### 9.2 历史仓库

#### `GET /api/v1/chats/:sessionId/history`

返回 assistant-ui `ExportedMessageRepository` 语义：

```json
{
  "head_id": "msg_a3",
  "messages": [
    {
      "parent_id": null,
      "run_config": { "custom": { "model": "12" } },
      "message": { "...ThreadMessage JSON..." }
    }
  ]
}
```

#### `POST /api/v1/chats/:sessionId/history`

append 一条消息节点，并更新 `head_id`。

#### `PUT /api/v1/chats/:sessionId/history/:messageId`

更新已有节点，用于 assistant-ui streaming 结束后覆盖占位消息。

## 10. 前端接法

### 10.1 运行时组合

前端采用 assistant-ui 官方组合：

- `useChatRuntime`
- `AssistantChatTransport`
- `useRemoteThreadListRuntime`
- `RuntimeAdapterProvider`
- `ThreadHistoryAdapter`

### 10.2 transport

`AssistantChatTransport` 只负责请求：

- `POST /api/agent/chat/feedmind`

请求头传：

- `x-feedmind-model-id`
- `x-feedmind-session-id`

### 10.3 thread list adapter

`RemoteThreadListAdapter` 只负责：

- list
- initialize
- fetch
- delete

### 10.4 history adapter

`ThreadHistoryAdapter` 只负责：

- `load`
- `append`
- `update`

## 11. 保留与删除

### 11.1 基本保留的 UI 文件

- `apps/web/components/assistant-ui/message.tsx`
- `apps/web/components/assistant-ui/thread.tsx`
- `apps/web/components/assistant-ui/thread-list.tsx`
- `apps/web/components/assistant-ui/composer.tsx`

### 11.2 删除或彻底替换

- `apps/agent/langgraph.json`
- `apps/agent/src/agent.ts`
- `apps/agent/src/middlewares/model-runtime.ts`
- `apps/web/lib/api/agent.ts` 中所有 LangGraph client / checkpoint / history 逻辑
- `apps/web/lib/assistant-runtime/provider.tsx` 中 `useLangGraphRuntime`

## 12. 实施阶段

### Phase 1：Mastra Agent 替换

只动 `apps/agent`。

完成标准：

- `apps/agent` 不再依赖 LangChain
- `/chat/feedmind` 可流式回复
- 现有 tool 行为不变

### Phase 2：API 历史仓库替换

只动 `apps/api`、`packages/db`、`packages/contracts`。

完成标准：

- `GET /history` 返回消息树
- append / update 可用
- `head_message_id` 正确更新

### Phase 3：前端 runtime 切换

只动 `apps/web`。

完成标准：

- 从 AI SDK runtime 正常发消息
- 分支切换、编辑、重生成行为不变

### Phase 4：清理与 review

删除 LangChain/LangGraph 残留，做结构收束。

## 13. 验收标准

必须全部通过：

- 流式输出正常
- 停止生成正常
- tool-call 展示正常
- reasoning 展示正常
- 新建会话正常
- 删除会话正常
- 切换会话正常
- 刷新后恢复历史正常
- 编辑历史用户消息后生成新分支
- 重新生成 assistant 后生成兄弟分支
- `BranchPicker` 正常切换
- 模型切换仍使用现有设置中心
- `pnpm run typecheck`
- `pnpm run test`
- 手工完整走一遍聊天链路

## 14. code review 清单

迁移完成后重点检查：

- 是否彻底移除所有 `@langchain/*`
- `apps/agent` 是否只负责 agent
- `apps/api` 是否只负责线程与历史
- `apps/web` 是否把 runtime、模型状态、运行状态解耦
- 是否还保留任何 checkpoint 兼容层
- 是否引入了多余 shim/fallback
- 中文注释是否只保留在不显然逻辑上

## 15. 风险与注意事项

### 15.1 最高风险点

最高风险不是工具迁移，而是：

- 分支树恢复
- 历史编辑
- 重新生成

因此必须优先验证 `ThreadHistoryAdapter` 的数据回放。

### 15.2 不建议启用 Mastra Memory

第一阶段不要启用 Mastra Memory。原因：

- 现有需求的关键是分支树，不是长期记忆
- 引入额外 memory 会把线程职责打散
- 与 assistant-ui 历史仓库并存会增加状态来源

### 15.3 当前工作区状态

当前工作区可见未提交改动：

- `packages/contracts/src/chat/index.ts`

正式开始开发前，应先确认该文件是否已有用户修改，避免将迁移工作混入脏状态。
