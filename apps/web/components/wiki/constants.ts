export const WIKI_TYPE_COLORS: Record<string, string> = {
  concept: "var(--color-editorial-primary)",
  entity: "var(--editorial-semantic-success)",
  source: "var(--editorial-semantic-warning)",
  overview: "var(--editorial-ink)",
  index: "var(--editorial-semantic-info)",
};

export const WIKI_TYPE_LABELS: Record<string, string> = {
  concept: "概念",
  entity: "实体",
  source: "来源",
  overview: "概览",
  reference: "引用",
  index: "索引",
  query: "查询",
  thesis: "论点",
  finding: "发现",
  methodology: "方法论",
  event: "事件",
};

/** 类型标签（大小写不敏感：LLM 生成的是 Overview/Reference 等首字母大写形式） */
export function wikiTypeLabel(type: string): string {
  return WIKI_TYPE_LABELS[type.toLowerCase()] ?? type;
}

export function wikiTypeColor(type: string): string {
  return WIKI_TYPE_COLORS[type.toLowerCase()] ?? "var(--color-editorial-ink-muted)";
}
