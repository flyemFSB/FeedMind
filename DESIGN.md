---
name: FeedMind
description: 任务驱动的趋势研究 Agent 系统
colors:
  canvas: "#f5f5f0"
  canvas-soft: "#fafaf7"
  canvas-deep: "#292524"
  surface-card: "#ffffff"
  surface-soft: "#f0efec"
  surface-strong: "#e7e5e2"
  surface-dark: "#292524"
  surface-dark-elevated: "#1c1917"
  ink: "#292524"
  ink-soft: "#57534e"
  ink-muted: "#a8a29e"
  ink-on-dark: "#ffffff"
  ink-on-dark-soft: "#a8a29e"
  ink-on-primary: "#ffffff"
  primary: "#292524"
  primary-active: "#1c1917"
  hairline: "#e7e5e2"
  hairline-soft: "#f0efec"
  hairline-strong: "#d6d3d0"
  gradient-mint: "#a7e5d3"
  gradient-peach: "#f4c5a8"
  gradient-lavender: "#c8b8e0"
  gradient-sky: "#a8c8e8"
  gradient-rose: "#e8b8c4"
  gradient-warm: "#f5d0c0"
  semantic-success: "#16a34a"
  semantic-error: "#dc2626"
  semantic-warning: "#d97706"
  semantic-info: "#2563eb"
  scrollbar-thumb: "#d6d3d0"

typography:
  display-mega:
    fontFamily: "SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: -0.02em
  display-xl:
    fontFamily: "SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.75rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.01em
  display-lg:
    fontFamily: "SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: -0.005em
  display-md:
    fontFamily: "SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0
  display-sm:
    fontFamily: "SF Pro Display, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 2vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: 0
  title-lg:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1rem, 1.5vw, 1.25rem)"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0
  title-md:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.9375rem, 1.25vw, 1.0625rem)"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: 0
  title-sm:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.875rem, 1vw, 0.9375rem)"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.01em
  body-lg:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.9375rem, 1.25vw, 1.0625rem)"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0.01em
  body-md:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.875rem, 1vw, 0.9375rem)"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0.01em
  body-sm:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.8125rem, 0.9vw, 0.875rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.01em
  caption:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.75rem, 0.8vw, 0.8125rem)"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.02em
  caption-uppercase:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.6875rem, 0.7vw, 0.75rem)"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.08em
    textTransform: uppercase
  button:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.8125rem, 0.9vw, 0.875rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.01em
  nav:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.8125rem, 0.9vw, 0.875rem)"
    fontWeight: 450
    lineHeight: 1.4
    letterSpacing: 0.01em
  mono:
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace"
    fontSize: "clamp(0.75rem, 0.8vw, 0.8125rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 20px
  pill: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  base: 16px
  md: 20px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  sidebar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.nav}"
    width: 260px
  sidebar-collapsed:
    backgroundColor: "{colors.canvas}"
    width: 60px
  topbar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.title-sm}"
    height: 56px
    border: 1px "{colors.hairline}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink-on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
    height: 38px
  button-primary-hover:
    backgroundColor: "{colors.primary-active}"
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "9px 19px"
    height: 38px
    border: 1px "{colors.hairline-strong}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-soft}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: 36px
  card:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-elevated:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "24px"
  text-input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: 40px
    border: 1px "{colors.hairline-strong}"
  message-user:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  message-assistant:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  composer:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
    border: 1px "{colors.hairline}"
  badge:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption-uppercase}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  tag:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  dialog:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-on-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  nav-item:
    backgroundColor: transparent
    textColor: "{colors.ink-soft}"
    typography: "{typography.nav}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.nav}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: FeedMind

## 1. Overview

**Creative North Star: "The Quiet Research Studio"**

FeedMind 的设计语言从 ElevenLabs 的编辑式品牌美学出发，将其克制、温暖、印刷杂志般的视觉气质，适配到一个以对话和知识管理为核心功能的产品中。这里没有 SaaS 产品的常见套路——没有霓虹色的 CTA、没有花哨的渐变按钮、没有开发者工具的暗色终端风格。取而代之的是一本安静的工作笔记本：暖米色的纸面画布、深棕墨色的文字、衬线字体书写的标题、以及偶尔出现的柔和渐变光晕——像是翻页时瞥见的一抹书签色彩。

这是一个**为长时间阅读和思考而设计**的系统。聊天记录的每一段文字、Wiki 页面的每一条笔记，都应该像印在纸上一样舒适。UI 框架退到幕后——边框细如发丝、阴影近乎不可见、色彩饱和度被刻意压低。功能性的操作元素（按钮、输入框、导航）保持清晰但不抢眼，用墨色填充的 pill 形状作为主要操作入口。

**Key Characteristics:**
- 暖米色画布（`#f5f5f0`），深棕墨色（`#292524`）文字。没有纯白、没有纯黑。
- 系统无衬线字体（-apple-system）作为统一字族。不再使用衬线显示字体，避免额外字体加载开销。
- Inter 承载正文、导航、标签——清晰、现代、不喧宾夺主。
- 主要操作为墨色 pill 按钮。仅此一种 CTA 颜色。
- 柔和渐变光晕（薄荷、桃色、薰衣草、天空、玫瑰、暖杏）作为纯装饰性氛围元素。
- 细发丝边框（`#e7e5e2`）代替厚重阴影。卡片几乎不浮起。
- 16px（`rounded.lg`）作为卡片和容器的默认圆角，pill 形状用于按钮和标签。

## 2. Colors: The Warm Editorial Palette

整个色彩系统围绕「暖米色 + 深棕色」的核心对比展开，饱和度被刻意压低。没有蓝色品牌色、没有霓虹点缀。

### Primary
- **Ink** (`#292524` / `oklch(27% 0.015 50)`): 唯一的主要操作色。用于主要按钮填充、重要文字、深色画布背景。使用量控制在 10% 以下。
- **Ink Active** (`#1c1917` / `oklch(20% 0.015 50)`): Ink 的按下状态。

### Neutral
- **Canvas** (`#f5f5f0` / `oklch(96.5% 0.005 70)`): 页面底色。暖米色——不是纯白，不是 SaaS 灰色。所有页面、侧边栏、顶栏都以此为基础。
- **Canvas Soft** (`#fafaf7` / `oklch(98% 0.004 70)`): 更浅的画布变体，用于次要区域或交替分段。
- **Canvas Deep** (`#292524`): 同 Ink——用于深色面板、对话框背景。
- **Surface Card** (`#ffffff`): 纯白卡片——在暖米色画布上，纯白已经足够区分。
- **Surface Soft** (`#f0efec` / `oklch(94% 0.004 70)`): 次要表面——消息气泡背景、hover 状态。
- **Surface Strong** (`#e7e5e2` / `oklch(91% 0.005 70)`): 标签底色、分隔线区域。

### Text
- **Ink** (`#292524`): 标题、主要文字。
- **Ink Soft** (`#57534e` / `oklch(45% 0.015 50)`): 正文。在中性米色背景上保持 ≥8:1 对比度。
- **Ink Muted** (`#a8a29e` / `oklch(72% 0.015 50)`): 次级说明文字、禁用状态。
- **Ink On Dark** (`#ffffff`): 深色画布上的文字。
- **Ink On Primary** (`#ffffff`): Ink 按钮上的白色文字。

### Hairlines
- **Hairline** (`#e7e5e2`): 默认分割线、卡片描边。
- **Hairline Soft** (`#f0efec`): 更浅的分割线——侧边栏项之间。
- **Hairline Strong** (`#d6d3d0`): 输入框边框、强调分割线。

### Atmospheric Gradient (Signature)
- **Gradient Mint** (`#a7e5d3`): 薄荷绿光晕。
- **Gradient Peach** (`#f4c5a8`): 蜜桃色光晕。
- **Gradient Lavender** (`#c8b8e0`): 薰衣草紫光晕。
- **Gradient Sky** (`#a8c8e8`): 天空蓝光晕。
- **Gradient Rose** (`#e8b8c4`): 玫瑰粉光晕。
- **Gradient Warm** (`#f5d0c0`): 暖杏色光晕。

> *这些渐变仅作为 `radial-gradient` 氛围光晕出现在空状态、欢迎页和品牌区域。永不作为按钮填充、文字颜色或组件背景。*

### Semantic
- **Success** (`#16a34a`): 成功确认。
- **Error** (`#dc2626`): 错误提示。
- **Warning** (`#d97706`): 警告信息。
- **Info** (`#2563eb`): 信息提示。

### Dark Mode (Apple HIG 设计系统适配)

深色模式基于 Apple Human Interface Guidelines (HIG) 色彩系统构建。这不是简单的亮度反转——HIG 定义了一套独立的光学层级（luminance hierarchy），确保暗色背景上的可读性和视觉秩序。

#### Background 层级 (颜色深度递减)

| Token | Value | HIG 对应 | 使用场景 |
|-------|-------|----------|----------|
| `canvas` | `#000000` | `systemBackground` | 页面底色、最底层 |
| `canvas-soft` / `surface-card` / `surface-dark` | `#1C1C1E` | `secondarySystemBackground` | 卡片、侧边栏、表面容器 |
| `surface-soft` | `#2C2C2E` | `tertiarySystemBackground` | 次级表面、hover 状态、分组内层 |
| `surface-strong` | `#3A3A3C` | `systemGray4` | 强调表面、标签底色 |

**Elevation 规则**: 浮起层级越高，背景越亮。popover、modal 等前景元素自动使用比当前层级更亮的表面色（e.g.，在 canvas 上的 modal 使用 `#1C1C1E`）。

#### Text 层级 (对比度递减)

| Token | Value | HIG 对应 | Alpha | 对比度 (vs `#000000`) |
|-------|-------|----------|-------|----------------------|
| `ink` (primary) | `#FFFFFF` | `label` | 100% | 21:1 (AAA) |
| `ink-soft` (secondary) | `#A6A6A8` | `secondaryLabel` 偏亮 | ~65%等效 | ~13:1 (AAA) |
| `ink-muted` (tertiary) | `#6B6B6D` | `tertiaryLabel` 偏亮 | ~42%等效 | ~6:1 (AA) |

所有 label 颜色以 `#EBEBF5` 为基色，层级通过 alpha 通道控制。CSS 变量预计算了在黑色背景上的混合结果，以 OKLCH 色空间存储。

#### Separator / Fill 参考

| Token | Value | HIG 对应 |
|-------|-------|----------|
| `hairline` | `#3A3A3C` | 接近 `separator` (rgba(84,84,88,0.6)) |
| `scrollbar-thumb` | `#3A3A3C` | 系统滚动条滑块 |

#### 设计原则

1. **避免纯白疲劳**: 纯黑画布 (`#000000`) 配合 OLED 省电，同时让白色文字有最高对比度。
2. **文本层级必须清晰**: 从纯白到中灰到深灰的三级阶梯，取代扁平的单色文字。
3. **表面不要纯黑**: 卡片和容器永远比画布亮一级，通过 `#1C1C1E` / `#2C2C2E` 建立视觉分层。
4. **色相偏移**: 暗色模式整体向冷色偏移（hue 290），与暖色 (hue 50~70) 的亮色模式形成昼夜对比。

### Named Rules

**The Ink Voice Rule.** Ink（`#292524`）是系统唯一的声音色。按钮、链接、活动状态——所有需要「操作感」的地方都用同一种深棕色。不引入蓝色品牌色、不添加第二个动作色。Ink 的稀缺性是其力量。

**The No-Neon Rule.** 禁止任何饱和的荧光色（霓虹绿、电光蓝、亮橙）。渐变光晕是系统中饱和度最高的元素，但它们从不作为操作指示。

## 3. Typography

**Display Font:** system-ui（回退 `'Times New Roman', serif`）— 400 字重。
**Body Font:** Inter（回退 `'SF Pro Display', 'Helvetica Neue', sans-serif`）— 400/500 字重。
**Mono Font:** JetBrains Mono（回退 `'SF Mono', 'Fira Code', monospace`）— 用于代码块、工具调用参数。

**Character:** 统一使用系统无衬线字体，减少首屏加载的额外字体请求——比 ElevenLabs 原版 Waldenburg 更有人文气息，适合中文语境下的长文阅读。Inter 作为正文字体，保证信息密度的清晰和 UI 元素的可扫描性。两者的组合是「古典标题 + 现代正文」——既不像传统杂志那样繁复，也不像通用 SaaS 那样乏味。

### Hierarchy
- **Display Mega** (400, clamp(2rem, 5vw, 3.5rem), 1.08, -0.02em): 欢迎页主标题、品牌展示区域。最大 56px。
- **Display XL** (400, clamp(1.75rem, 4vw, 2.75rem), 1.1, -0.01em): 页面级标题、Wiki 页面标题。
- **Display LG** (400, clamp(1.5rem, 3vw, 2.25rem), 1.15): 区域标题、对话框标题。
- **Display MD** (400, clamp(1.25rem, 2.5vw, 1.75rem), 1.2): 卡片标题、面板标题。
- **Title LG** (500, clamp(1rem, 1.5vw, 1.25rem), 1.3): 会话列表中对话标题、侧边栏分组标题。
- **Title MD** (500, clamp(0.9375rem, 1.25vw, 1.0625rem), 1.35): 导航项文字、设置项标签。
- **Body MD** (400, clamp(0.875rem, 1vw, 0.9375rem), 1.55, +0.01em): 默认正文、聊天气泡文字。最长行宽限制 70ch。
- **Body SM** (400, clamp(0.8125rem, 0.9vw, 0.875rem), 1.5): 次要说明文字、时间戳。
- **Caption** (400, clamp(0.75rem, 0.8vw, 0.8125rem), 1.4): 标签内文字、提示文字。
- **Caption Uppercase** (500, 0.75rem, 1.3, +0.08em): 分类标签、徽章。
- **Button** (500, 0.875rem, 1, +0.01em): 所有按钮文字。
- **Mono** (400, 0.8125rem, 1.5): 代码块、工具调用参数、JSON 预览。

### Named Rules

**The Weight Rule.** 显示字重不超过 500（系统字体的常规字重）。标题用衬线体的默认粗细即可——不用 bold、不用 light。正文 Inter 保持在 400/500，不用 300。

**The Line Length Rule.** 正文最长 70 字符（`max-width: 70ch`）。聊天消息、Wiki 正文、设置说明——所有可读内容块都遵守此限制。让用户在舒适的行宽内阅读，不需要左右摆头。

## 4. Elevation

系统采用**近乎扁平**的层次策略。深度不通过阴影表达，而是通过色彩和发丝边框来建立视觉层次。

- 页面画布（Canvas）是最底层。所有组件都直接放在画布上。
- 卡片（Card）使用纯白表面 + 1px 发丝边框（`hairline`），与画布区分。
- 交互元素（悬浮、聚焦）不发散阴影，而是通过背景色调变化（从 `surface-card` 变为 `surface-soft`）来表达。
- 唯一例外：浮动 composer 输入框使用单层软阴影（`0 8px 30px rgba(41,37,36,0.08)`），表明它是键盘交互的焦点。
- 对话框/弹出层使用 `canvas-deep` 背景 + 发丝边框 + 极淡阴影（`0 12px 40px rgba(41,37,36,0.12)`）。

| 层级 | 处理方式 | 使用场景 |
|------|---------|---------|
| 画布 | Canvas 底色 | 页面、侧边栏、顶栏 |
| 表面 | 纯白 + 1px 发丝边框 | 卡片、面板、对话框 |
| 交互 | 背景色加深（surface-soft） | Hover、选中状态 |
| 浮动 | 软阴影（8px blur） | 浮动输入框 |
| 模态 | 深色背景 + 发丝边框 + 阴影（12px blur） | 对话框、下拉菜单 |

## 5. Components

### Sidebar
- **宽度:** 260px（展开）/ 60px（收起）
- **底色:** Canvas（`#f5f5f0`），无边框（右侧以顶栏的 hairline 为界）
- **导航项:** 14px Inter 450，padding 8px 12px，hover 时变 Surface Soft 背景
- **活跃项:** Surface Soft 背景 + Ink 文字
- **「新会话」按钮:** Ink pill，38px 高，圆角 pill，白色文字

### Top Bar
- **高度:** 56px
- **底色:** Canvas，底部 1px Hairline 分割
- **布局:** 左侧标题 + 中间（可选） + 右侧模型选择器

### Buttons
- **Primary (Ink Pill):** Ink 填充（`#292524`），白色文字，38px 高，pill 圆角。Hover 变 `primary-active`（`#1c1917`）。不用阴影、不用边框。
- **Outline:** 透明背景，1px `hairline-strong` 边框，Ink 文字。Hover 时背景变 `surface-soft`。
- **Ghost:** 透明，Ink Muted 文字。Hover 时 Ink 文字 + `surface-soft` 背景。
- **Icon (Square):** 36×36px，ghost 风格，rounded md（8px）。

### Cards
- **样式:** 纯白背景，1px hairline 边框，12px（`rounded.lg`）圆角。无阴影。
- **内边距:** 20px（`spacing.base`）。
- **Hover:** 边框加深至 `hairline-strong`。

### Text Inputs / Textareas
- **样式:** 纯白背景，1px `hairline-strong` 边框，8px（`rounded.md`）圆角，40px 高。
- **内边距:** 10px 14px。
- **Focus:** 边框变为 2px Ink（`#292524`）。无 glow、无 ring。
- **Disabled:** 背景变为 `surface-soft`，文字变为 `ink-muted`。
- **Placeholder:** `ink-muted` 颜色。

### Messages (Chat)
- **用户消息:** Surface Soft（`#f0efec`）背景气泡，12px 圆角，12px 16px 内边距。靠右对齐。
- **助理消息:** 透明背景，无气泡——IM 风格纯文字，靠左对齐。头像使用 FeedMind logo（28x28px）。
- **时间戳:** Caption 字号，Ink Muted 色。
- **思考/推理:** 可折叠面板。1px hairline 边框，12px 圆角。标题「思考过程」，展开/折叠图标。

### Composer (Chat Input)
- **容器:** 纯白背景，1px hairline 边框，16px（`rounded.xl`）圆角，12px 16px 内边距。
- **阴影:** `0 8px 30px rgba(41,37,36,0.08)`。
- **输入区:** 无边框 textarea，15px Inter 400，自适应高度（最小 2 行，最大 8 行）。
- **操作区:** 左侧附件按钮（ghost icon），右侧发送/停止按钮（Ink pill）。

### Thread List
- **项:** 无背景/边框，10px 圆角。Hover 变 `surface-soft`。
- **活跃项:** `surface-soft` 背景。
- **标题:** Title MD（17px Inter 500），单行截断。
- **操作菜单:** 点击 `MoreHorizontal` 图标弹出菜单——重命名、固定、删除。

### Dialog / Modal
- **容器:** 纯白，20px（`rounded.xxl`）圆角，24px 内边距。
- **阴影:** `0 12px 40px rgba(41,37,36,0.12)`。
- **遮罩层:** Ink 色 40% 透明度。
- **标题:** Display MD（1.25rem）。
- **关闭按钮:** Icon ghost。

### Tabs
- **样式:** 底部 1px hairline 分割线。活跃标签使用 2px Ink 下划线 + Ink 文字。
- **非活跃:** `ink-muted` 文字，hover 变 `ink-soft`。

### Badges / Tags
- **Badge:** Surface Strong 背景，Caption Uppercase 文字，pill 圆角，3px 10px 内边距。
- **Tag:** Surface Soft 背景，Caption 文字，pill 圆角，4px 10px 内边距。

### Scrollbar
- **宽度:** 8px
- **轨道:** 透明
- **滑块:** `scrollbar-thumb`（`#d6d3d0`），4px 圆角。Hover 加深至 `#c0bcb8`。

## 6. Do's and Don'ts

### Do:
- **Do** 使用 Ink（`#292524`）作为唯一的主要操作色。所有主要按钮、链接、活动指示器使用同一种深棕色。
- **Do** 使用 系统字体作为正文和标题的统一字族。避免加载第三方字体加重首屏负担。
- **Do** 使用 Inter 作为正文，保持 +0.01em 字间距——略带宽松的编辑感。
- **Do** 使用暖米色画布（`#f5f5f0`）作为页面底色。所有页面以此为基准。
- **Do** 使用 pill 形状（`rounded.pill`）作为按钮和标签的统一形状。
- **Do** 使用发丝级边框（`hairline` / `hairline-soft`）代替阴影来表达层次。
- **Do** 使用柔和渐变光晕（mint/peach/lavender/sky/rose/warm）作为纯装饰氛围，仅限空状态和品牌区域。
- **Do** 保持正文行宽 ≤70ch，让长文本易于阅读。
- **Do** 使用 `text-wrap: balance` 优化标题换行。

### Don't:
- **Don't** 引入蓝色（`#0071e3`）或其他饱和品牌色作为操作色。Ink 是唯一的 CTA 颜色。
- **Don't** 使用渐变作为按钮填充、文字颜色或组件背景。渐变仅限于氛围光晕。
- **Don't** 使用厚重阴影（`box-shadow` blur > 12px）。卡片不发散阴影。
- **Don't** 使用暗色终端风格、霓虹色、玻璃拟态。不要像开发者工具。
- **Don't** 显示字重超过 600。标题保持 400-500 字重。
- **Don't** 使用小于 8px 的圆角作为卡片和容器的默认值。
- **Don't** 使用纯白（`#ffffff`）作为页面底色——Canvas（`#f5f5f0`）才是基准。
- **Don't** 使用 `border-left` / `border-right` 大于 1px 的彩色条纹作为装饰。
- **Don't** 使用全大写或 wide tracking 作为正文样式。
- **Don't** 在 SaaS/产品功能区使用「英雄指标」布局（大数字 + 小标签）。

