/**
 * 自定义 Streamdown code 插件——仅加载主流编程语言的语法高亮
 * 避免 shiki 加载全部 100+ 种语言的 grammar 文件
 */
"use client";

import { code } from "@streamdown/code";

/** 主流编程语言白名单 */
const MAINSTREAM_LANGS = new Set([
  "javascript", "typescript", "jsx", "tsx", "json",
  "html", "css", "scss", "less",
  "python", "bash", "shell", "sql",
  "rust", "go", "java", "cpp", "c", "csharp",
  "markdown", "yaml", "toml", "dockerfile", "graphql",
  "plaintext", "text",
]);

/**
 * lightweightCode — 基于 @streamdown/code 的轻量包装
 * 仅识别主流语言，阻止 shiki 加载小众语言 grammar
 */
export const lightweightCode = {
  ...code,
  supportsLanguage(lang: string) {
    if (!lang) return false;
    const normalized = lang.trim().toLowerCase();
    return MAINSTREAM_LANGS.has(normalized);
  },
  getSupportedLanguages() {
    return Array.from(MAINSTREAM_LANGS);
  },
};
