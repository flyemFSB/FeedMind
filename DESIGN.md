---
name: FeedMind
description: A task-driven trend-research agent system — silent, editorial, local-first.
colors:
  primary: "#37352d"
  primary-active: "#2b2a25"
  accent: "#37352d"
  accent-soft: "#efefef"
  ink: "#37352d"
  ink-soft: "#9b9a97"
  ink-muted: "#bfbdb8"
  canvas: "#ffffff"
  canvas-soft: "#f7f6f3"
  surface-card: "#ffffff"
  surface-soft: "#f7f6f3"
  surface-strong: "#efefef"
  hairline: "#e9e9e7"
  hairline-soft: "#f0efec"
  hairline-strong: "#d1d0cc"
  semantic-success: "oklch(0.55 0.18 145)"
  semantic-error: "oklch(0.55 0.23 25)"
  semantic-warning: "oklch(0.65 0.16 85)"
  semantic-info: "oklch(0.55 0.16 250)"
  dark-primary: "#ffffff"
  dark-primary-active: "#e0e0e0"
  dark-accent: "#ffffff"
  dark-accent-soft: "#2e2e2e"
  dark-ink: "#ffffff"
  dark-ink-soft: "#cdcdcd"
  dark-ink-muted: "#9b9a97"
  dark-canvas: "#191919"
  dark-canvas-soft: "#111111"
  dark-surface-card: "#191919"
  dark-surface-soft: "#111111"
  dark-surface-strong: "#2e2e2e"
  dark-hairline: "#2e2e2e"
  dark-hairline-soft: "#1f1f1f"
  dark-hairline-strong: "#454545"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  button-ghost-hover:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  input-default:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    borderColor: "{colors.hairline}"
  input-focus:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    ringColor: "{colors.hairline-strong}"
  card-default:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
    borderColor: "{colors.hairline}"
---

# Design System: FeedMind

## 1. Overview

**Creative North Star: "The Quiet Research Companion"**

FeedMind is a locally-run trend-research agent that moves through three stages — collect, discuss, and organize — in a single, distraction-free workspace. The design disappears into the task. Every pixel serves the content: chat transcripts, wiki pages, and source feeds are the real interface. Chrome, toolbars, and decorative flourishes recede to near-invisibility.

The system is **editorial in spirit, not SaaS**. It rejects the visual grammar of cloud productivity tools (gradients, heavy shadows, brand-colored sidebars, animated logos) in favor of the conventions that make tools like Notion, iA Writer, and Linear feel trustworthy: flat surfaces, subtle borders, single-family typography at a tight scale, and interaction feedback that never competes with content.

**Key Characteristics:**

- **Silent hierarchy.** Depth comes from tonal layering (background color shifts of ~10–15 L%), not shadows. The canvas is pure white (#ffffff), the sidebar is warm off-white (#f7f6f3), and the workspace island is white — a single step of tonal separation.
- **Monochrome-first.** The entire palette is neutral gray on white. The primary "color" is text (#37352d, a warm near-black). There is no brand color, no accent color beyond what selection highlights and focus rings provide. The product's visual identity is typography and spacing.
- **Restrained motion.** Transitions exist only to communicate state (hover, focus, open/close). Duration is 150ms. No page-load choreography, no parallax, no entrance animations. Motion conveys state, not personality.
- **Local-first confidence.** The UI doesn't announce itself. No onboarding tours, no feature callouts, no empty-state illustrations. Empty states teach the interface in a single line of text.

## 2. Colors: The Monochrome Neutral Palette

The palette is a measured gray scale with a barely-warm lean (chroma ≈ 0.003 toward 60° hue on the lightest tones). The warmth is imperceptible as color but prevents the clinical cold of pure gray. Dark mode inverses the scale with the same logic: the canvas is a deep warm-gray (#191919) rather than pure black.

### Light Mode

- **Primary / Accent** (`#37352d`): Text and interactive elements. This warm near-black is the strongest color in the system. Used for body text, active labels, and primary button backgrounds. It replaces what would be a brand accent in conventional product UIs.
- **Accent Soft** (`#efefef`): The hover and selected-state background for interactive elements. A very light gray (L ≈ 94%) that sits one step above the canvas soft.
- **Canvas** (`#ffffff`): The main workspace background. Pure white for maximum contrast with text.
- **Canvas Soft** (`#f7f6f3`): The sidebar and secondary panel background. A barely-warm off-white (L ≈ 97%) that creates the tonal layer beneath the canvas.
- **Surface Strong** (`#efefef`): For hover states and subtle dividers. The most prominent gray before text.
- **Ink** (`#37352d`): Primary text. Contrast ratio 14:1 against white canvas.
- **Ink Soft** (`#9b9a97`): Secondary text, metadata, helper text. Contrast ratio 4.5:1 against white canvas — WCAG AA compliant for body text.
- **Ink Muted** (`#bfbdb8`): Placeholder text and disabled labels. Contrast ratio 3:1 against white.
- **Hairline** (`#e9e9e7`): Borders between surfaces. A very light gray (L ≈ 92%) that defines structure without competing with content.
- **Hairline Strong** (`#d1d0cc`): The focus ring color. Used for `focus-visible` outlines and keyboard navigation indicators.

### Dark Mode

The same scale inverted:

- **Canvas** (`#191919`): Workspace background. A warm deep-gray (L ≈ 10%), not pure black, to avoid FALD blooming on OLED text rendering.
- **Canvas Soft** (`#111111`): Sidebar background (L ≈ 7%).
- **Surface Strong** (`#2e2e2e`): Hover states and elevated surfaces.
- **Ink** (`#ffffff`): Text on dark.
- **Ink Soft** (`#cdcdcd`): Secondary text (contrast ≈ 7:1 against #191919).
- **Ink Muted** (`#9b9a97`): Placeholder text.
- **Hairline** (`#2e2e2e`): Borders in dark mode.
- **Hairline Strong** (`#454545`): Focus rings in dark mode.

### Named Rules

**The One-Step Rule.** No surface should be more than one tonal step away from its parent. The sidebar (canvas-soft, L ≈ 97%) sits directly on the canvas (L 100%). The workspace island is the same white as the canvas; only the border separates them. Two steps create a hole; zero steps create ambiguity.

**The Warm Near-Black Rule.** The darkest color in the system (#37352d) is not pure black. Its slight warmth (RGB 55,53,45) prevents the dead-flatness of `#000000` text on white while remaining neutral enough to not register as a tint. The same principle applies in dark mode: backgrounds are warm deep-gray, not black.

**The No-Brand-Color Doctrine.** There is no brand blue, no brand red, no brand anything. The product's identity is carried by typography, spacing, and content. Color exists only to separate surfaces, grade information, and indicate state. This is non-negotiable.

### Semantic Colors

- **Success** (`oklch(0.55 0.18 145)`): A muted green for connected indicators and confirmation states.
- **Error** (`oklch(0.55 0.23 25)`): A desaturated red for destructive actions and validation errors.
- **Warning** (`oklch(0.65 0.16 85)`): An amber for attention signals.
- **Info** (`oklch(0.55 0.16 250)`): A neutral blue for informational indicators.

These appear on ≤1% of any screen. Their rarity is the point.

## 3. Typography

**Font Stack:** System-native sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`). No custom fonts, no web font loading. The system stack loads instantly, matches the OS chrome, and supports CJK natively. **Mono Stack:** `'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, monospace` — for code blocks and inline code in the wiki reader and chat messages.

**Character:** Single-family utilitarian sans. There is no display/body pairing because product UIs don't need one. A well-tuned sans at multiple weights carries the entire interface. The voice is quiet: normal tracking, normal case, no uppercase eyebrows. Information is conveyed by position and weight, not decoration.

### Hierarchy

- **Topbar Title** (600 weight, 14px, 1.5 line-height): Section labels in the workspace top bar. Single line, truncated.
- **Body** (400 weight, 14px, 1.5 line-height): Chat messages, wiki page content, form labels, lists. Prose blocks cap at 65–75 characters per line via max-width.
- **Small / Secondary** (400 weight, 12–13px, 1.4 line-height): Tab labels, metadata, timestamps, source names, helper text.
- **Button / Label** (500 weight, 12–13px, 1.4 line-height): Buttons, pills, tags, and compact UI labels.
- **Headers (wiki content)** (600 weight, variable 16–24px line-height 1.3): The rich-text hierarchy inside the wiki reader and editor, set by markdown heading levels.
- **Mono** (400 weight, 13px, 1.5 line-height): Inline code, code blocks, and technical data views.

### Named Rules

**The Single Stack Rule.** No second font family enters the system. Not for display headings, not for pull quotes, not for branding. The system font stack is the only font stack. Custom fonts are forbidden — they delay first paint, mismatch the OS, and compete with the editorial quiet the product promises.

**The No-Eyebrow Rule.** Tiny uppercase tracked labels ("NAVIGATION", "SETTINGS", "PAGES") are prohibited. Section hierarchy is conveyed through position, not typographic casing. All UI labels are sentence-case.

## 4. Elevation

This system does not use shadows for depth. Depth is conveyed exclusively through tonal layering — a one-step background color shift from canvas to canvas-soft, or from surface to surface-strong. Surfaces that need visual separation receive a `border-editorial-hairline` (1px solid, 91% gray) on the edge shared with the adjacent surface.

The only exception is the Agent Drawer on narrow screens, which deploys a `shadow-sm` (`0 1px 2px 0 rgba(0,0,0,0.05)`) to lift the floating panel above the workspace content. This is a response to viewport constraints, not a depth system.

- **Z-layer 0:** Canvas (workspace background)
- **Z-layer 1:** Sidebar, drawer, workspace island (separated by border, not shadow)
- **Z-layer 2:** Dropdown, popover, dialog, tooltip (separated by `shadow-sm` + `ring-1 ring-foreground/10`)
- **Z-layer 3:** Toast, tooltip (always on top, `shadow-sm`)

### Named Rules

**The Flat-By-Default Rule.** Every surface is flat at rest. Shadows appear only as a response to state: a floating drawer when the viewport is narrow, a dropdown menu when opened, a dialog when modal. No surface ever has a resting shadow.

## 5. Components

### Buttons

- **Shape:** Rounded-md (6px). No pill shapes, no square buttons.
- **Padding:** 10px 12px (default), 8px 10px (icon-only).
- **Height:** 32px (h-8) for default, 28px (h-7) for small, 24px (h-6) for extra-small.
- **Typography:** 13px, 500 weight, system font, sentence-case.
- **Transition:** `background-color 150ms ease-out`, no transform.
- **States:**
  - **Primary:** Background `--editorial-primary` (#37352d light / #ffffff dark). Text white / dark-canvas. Hover: opacity 80%.
  - **Outline:** Transparent background, `--editorial-hairline` border. Hover: fills to `--editorial-hairline`.
  - **Ghost:** Transparent, no border. Hover: fills to `--editorial-hairline`.
  - **Destructive:** Transparent, text `--editorial-semantic-error`. Hover: fills to 10% error with border.
  - **Disabled:** Opacity 50%, no pointer events.

### Inputs & Textareas

- **Shape:** Rounded-md (6px). No pill inputs.
- **Background:** White (light) / transparent (dark).
- **Border:** 1px solid `--editorial-hairline` (#e9e9e7 light / #2e2e2e dark).
- **Typography:** 14px body, 12px placeholder.
- **Padding:** 8px 10px (h-8).
- **Focus:** `focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`.
- **Transition:** `150ms ease-out`.
- **States:**
  - **Placeholder:** `--editorial-ink-muted` (#bfbdb8 light / #9b9a97 dark).
  - **Disabled:** `opacity 50%`, `cursor: not-allowed`, `background: --editorial-hairline/50`.
  - **Invalid:** `aria-invalid` toggles destructive border color + ring.

### Navigation (Sidebar)

- **Shape:** Rounded-md (6px) on individual icon buttons.
- **Icon container:** 36×36px.
- **Icons:** Lucide, stroke-width 1.6 (default) / 2 (active), size 18px.
- **Typography:** Tooltip only (no labels).
- **States:**
  - **Default:** `--editorial-ink-soft` (#9b9a97).
  - **Hover:** Background `--editorial-surface-strong` (#efefef), text `--editorial-ink`.
  - **Active:** Background `--editorial-accent-soft` (#efefef), text `--editorial-ink`.
  - **Focus:** Ring `--editorial-hairline-strong` (#d1d0cc).

### Cards & Containers

- **Shape:** Rounded-md (6px) for small containers, rounded-lg (8px) for dialogs.
- **Background:** `--editorial-surface-card` (#ffffff light / #191919 dark).
- **Border:** 1px solid `--editorial-hairline` (#e9e9e7 light / #2e2e2e dark).
- **Shadow:** None at rest. Dialog and popover containers get `shadow-sm`.
- **Padding:** 16px (p-4) as default internal padding.

### Dialog / Popover

- **Shape:** Rounded-lg (8px).
- **Background:** `--color-popover` (#ffffff light / #191919 dark).
- **Ring:** 1px `--color-foreground/10` to define the edge on light backgrounds.
- **Shadow:** `shadow-sm` (`0 1px 2px 0 rgba(0,0,0,0.05)`).
- **Overlay:** `rgba(0,0,0,0.10)` (light) / `rgba(0,0,0,0.40)` (dark), with optional `backdrop-blur-xs`.
- **Close button:** Ghost variant, positioned top-right.

### Tabs

- **Shape:** Rounded-md (6px) on the list container; individual tabs have no visible border.
- **List Background:** `--editorial-surface-soft` (#f7f6f3).
- **Tab states:**
  - **Default:** `color: --foreground/60`, no background.
  - **Hover:** `color: --foreground`.
  - **Active:** White background, `color: --foreground`, inherits the tab list's rounded-md to create a "raised pill" effect.
- **Line variant (optional):** No background on the list. Active tab gets a 2px underline via pseudo-element.

### Badges & Tags

- **Shape:** Rounded-md (4px). No pill shapes.
- **Height:** 20px (h-5).
- **Typography:** 12px, 500 weight.
- **Default variant:** `--color-primary/60` background with `--color-primary-foreground` text and a `border-primary/30`.
- **Outline variant:** `--color-border` border, `--color-foreground` text.

## 6. Do's and Don'ts

### Do:

- **Do** use tonal layering (background color shifts of 3–10 L%) to separate surfaces instead of shadows. The sidebar is `#f7f6f3` against a `#ffffff` canvas; that single step is enough.
- **Do** keep all interactive element transitions to `150ms ease-out` with `transition-colors` only. No transform, no scale, no translate on hover or active states.
- **Do** use `rounded-md` (6px) for buttons, inputs, and navigation items. Use `rounded-lg` (8px) for dialogs and large containers.
- **Do** use the system font stack exclusively. No @font-face, no web font loading.
- **Do** make body text contrast ≥ 4.5:1 against its background. The ink-soft (#9b9a97) on white is exactly 4.5:1 — this is the floor. Placeholder text must match the same ratio.
- **Do** prefer inline form validation and progressive disclosure over modals.

### Don't:

- **Don't** use any blue, brand color, or accent color anywhere in the UI. The entire palette is neutral gray. The darkest color (#37352d) serves as the primary, accent, and text color. Only semantic indicators (success/error/warning/info) carry hue, and they appear on ≤1% of any screen.
- **Don't** use `rounded-2xl`, `rounded-3xl`, or `rounded-full` on buttons, cards, inputs, badges, or containers. Reserved exclusively for avatars, radio buttons, and switch handles.
- **Don't** use `shadow-md`, `shadow-lg`, `shadow-xl`, or `shadow-2xl`. The only acceptable shadow is `shadow-sm` (`0 1px 2px 0 rgba(0,0,0,0.05)`), used only on floating elements (dropdowns, dialogs, narrow-screen drawers).
- **Don't** use `hover:-translate-y-1`, `active:scale-95`, or any transform-based interaction on interactive elements. Notion-style UIs are flat and don't float.
- **Don't** use gradients — not for backgrounds, not for text, not for overlays. The `bg-gradient-*` family is forbidden.
- **Don't** use `border-left` or `border-right` as colored accent stripes on any element. Use full borders or background tints instead.
- **Don't** use glassmorphism (backdrop-filter blur on semi-transparent surfaces) as a default treatment.
- **Don't** use tiny uppercase tracked labels ("eyebrows") above section headings. Section hierarchy comes from position, not typographic casing.
- **Don't** use numbered section markers (01 / 02 / 03) as default scaffolding. Numbers earn their place only when the section is a genuine sequence.
- **Don't** nest cards. A card inside a card is always wrong.
- **Don't** use skeleton screens or spinner animations for loading. Use inline skeleton spans that match the text dimensions.
- **Don't** pair `border: 1px solid` with `box-shadow` blur ≥ 16px on the same element. Pick one.
