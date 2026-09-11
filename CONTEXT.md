# FeedMind 前端 UI 栈上下文

描述 FeedMind 前端 UI 组件栈的领域语言。核心事实：全项目只有**一套 Base UI 基元集**——ai-elements（agent 组件）与产品组件共用同一套 shadcn 基元，底层是 `@base-ui/react`（style=base-nova）。

## Language

**ai-elements**:
Vercel 官方的 AI 前端组件注册表（基于 shadcn/ui），通过 `npx ai-elements@latest add <组件>` 把源码拉进项目 `components/ai-elements/`。不是 npm 包，"官方"指"不偏离上游源码"。
_Avoid_: AI Elements 包、内置组件库

**shadcn 基元**:
`components/ui/*` 下的薄包装组件（button、input、dialog…），由 shadcn CLI 生成，是项目的基座。
_Avoid_: UI 库、组件库

**base-ui 基元集**:
全项目唯一的 shadcn 基元集，底层是 `@base-ui/react`（style=base-nova）。ai-elements 与产品组件（settings、wiki、app-shell、chat…）共用同一套，不存在第二套。
_Avoid_: 默认基元、新基元、双轨栈

**agent 组件**:
ai-elements 中用于 AI 对话 UI 的组件：conversation、message（含 MessageResponse）、prompt-input、reasoning、tool、sources。与产品组件共用 base-ui 基元集。
_Avoid_: AI 组件、聊天组件

**editorial 重套**:
对官方 ai-elements 源码的最小适配策略：结构/逻辑完全跟随官方，样式差异收敛到 globals.css 的 token/类覆盖，源码只允许"中文文案 + import 路径适配 + base-ui 对齐"三类改动。
_Avoid_: 定制、二次开发、复刻

**base-ui 对齐**:
ai-elements 官方源码构建在 radix-ui 上，本项目落地时统一改接 base-ui 基元。这是 editorial 重套里唯一会随上游更新反复发生的改动，也是升级时必须重放的部分。
_Avoid_: 改写、移植

**跟随上游**:
维护原则：官方注册表源码是唯一来源，editorial 重套的 diff 保持最小，升级 = 重拉官方源码后重放本地 diff（中文文案 + import 路径 + base-ui 对齐）。
_Avoid_: 维护 fork、自维护副本
