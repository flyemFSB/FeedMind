# FeedMind 前端 UI 栈上下文

描述 FeedMind 前端 UI 组件栈的领域语言。核心事实：项目采用**混合双轨 UI 栈**——ai-elements（agent 组件）运行在 radix-ui 上，其余 shadcn 基元保持 base-ui，两套共用同一套设计 token。

## Language

**ai-elements**:
Vercel 官方的 AI 前端组件注册表（基于 shadcn/ui），通过 `npx ai-elements@latest add <组件>` 把源码拉进项目 `components/ai-elements/`。不是 npm 包，"官方"指"不偏离上游源码"。
_Avoid_: AI Elements 包、内置组件库

**shadcn 基元**:
`components/ui/*` 下的薄包装组件（button、input、dialog…），由 shadcn CLI 生成，是项目的基座。
_Avoid_: UI 库、组件库

**base-ui 基元集**:
app 通用组件（settings、wiki、app-shell、chat 除 ai-elements 外的部分）所用的 shadcn 基元，底层是 `@base-ui/react`（style=base-nova）。保持现状不动。
_Avoid_: 默认基元、老基元

**radix 基元集**:
为 ai-elements 专用的独立 shadcn 基元集（独立路径，如 `components/ui/radix/*`），底层是 radix-ui（new-york 风格）。与 base-ui 基元集并存。
_Avoid_: 新基元、radix 组件

**agent 组件**:
ai-elements 中用于 AI 对话 UI 的组件：conversation、message（含 MessageResponse）、prompt-input、reasoning、tool、sources。运行在 radix 基元集上。
_Avoid_: AI 组件、聊天组件

**editorial 重套**:
对官方 ai-elements 源码的最小适配策略：结构/逻辑完全跟随官方，样式差异收敛到 globals.css 的 token/类覆盖，源码只允许"中文文案 + import 路径适配"两类改动。
_Avoid_: 定制、二次开发、复刻

**跟随上游**:
维护原则：官方注册表源码是唯一来源，editorial 重套的 diff 保持最小，升级 = 重拉官方源码后重套 diff。
_Avoid_: 维护 fork、自维护副本

**双轨栈**:
本项目同时使用 base-ui 与 radix-ui 两套 headless 库的架构决策（见 docs/adr/0001）。
