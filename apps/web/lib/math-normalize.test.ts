import { describe, expect, it } from "vitest";
import { normalizeMathMarkdown } from "./math-normalize";

describe("normalizeMathMarkdown", () => {
  it("将 \\( ... \\) 行内公式转换为 $ ... $", () => {
    const input =
      "地层孔隙度计算公式为 \\( \\phi = \\frac{\\rho_{ma} - \\rho_b}{\\rho_{ma} - \\rho_f} \\)，其中参数已知。";
    const output = normalizeMathMarkdown(input);
    expect(output).toBe(
      "地层孔隙度计算公式为 $\\phi = \\frac{\\rho_{ma} - \\rho_b}{\\rho_{ma} - \\rho_f}$，其中参数已知。",
    );
  });

  it("将 \\[ ... \\] 块级公式转换为 $$ ... $$", () => {
    const input = "计算公式如下：\n\\[\nE = mc^2\n\\]\n结论成立。";
    const output = normalizeMathMarkdown(input);
    expect(output).toContain("$$\nE = mc^2\n$$");
  });

  it("保持代码块中的内容不被转换", () => {
    const input = "示例代码：\n```ts\nconst str = '\\( x + y \\)';\n```\n外部公式：\\( a + b \\)";
    const output = normalizeMathMarkdown(input);
    expect(output).toContain("const str = '\\( x + y \\)';");
    expect(output).toContain("$a + b$");
  });

  it("处理独立 \\begin{equation} 环境", () => {
    const input = "\\begin{equation}\ny = ax + b\n\\end{equation}";
    const output = normalizeMathMarkdown(input);
    expect(output).toContain("$$\n\\begin{equation}\ny = ax + b\n\\end{equation}\n$$");
  });
});
