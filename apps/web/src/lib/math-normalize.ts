/** 规范化 Markdown 数学公式语法（\[...\]、\begin{equation}、\(...\)），跳过代码块 */
export function normalizeMathMarkdown(text: string): string {
  if (!text) return "";

  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const parts = text.split(codeBlockRegex);

  return parts
    .map((part, index) => {
      // 代码块内容严格保持原样
      if (index % 2 === 1) {
        return part;
      }

      let result = part;

      // 块级公式 \[ ... \] -> $$ ... $$
      result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => {
        const trimmed = math.trim();
        return `\n\n$$\n${trimmed}\n$$\n\n`;
      });

      // 独立环境 \begin{equation} 等 -> $$ ... $$
      result = result.replace(
        /(?<!\$\$[\s\S]*?)\\begin\{(equation|align|gather|alignat|flalign)\*?\}([\s\S]*?)\\end\{\1\*?\}/g,
        (match) => {
          return `\n\n$$\n${match.trim()}\n$$\n\n`;
        },
      );

      // 行内公式 \( ... \) -> $ ... $
      result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => {
        const trimmed = math.trim();
        return `$${trimmed}$`;
      });

      return result;
    })
    .join("");
}
