// MathJax SVG 渲染配置：公式内联为 SVG 路径，不依赖下载字体，
// 从根本上避免 KaTeX 字体加载失败/回退导致的上下标、求和等符号错位。
// 必须以 math 插件形式注入：streamdown 会把 remarkPlugins prop 透传到各块的子管道且排在
// remarkGfm 之前，remark-math 会破坏 GFM 表格解析；math 插件只在主管道 gfm 之后生效。
import remarkMath from "remark-math";
import rehypeMathjax from "rehype-mathjax/svg";
import type { MathPlugin } from "streamdown";

export const mathjaxPlugin: MathPlugin = {
  name: "katex", // MathPlugin.name 是 "katex" 字面量，仅作数学插件族标识，实际渲染走 rehype-mathjax
  type: "math",
  remarkPlugin: [remarkMath, { singleDollarTextMath: true }],
  rehypePlugin: [rehypeMathjax, {}],
};
