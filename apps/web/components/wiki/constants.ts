import { WIKI_CONCEPT_TYPES, WIKI_CONCEPT_TYPE_LABELS } from "@feedmind/contracts";

/** 类型 → 颜色。目录级键兼容图谱/索引场景；知识形态键（受控枚举）用于概念分组。 */
export const WIKI_TYPE_COLORS: Record<string, string> = {
  concept: "var(--color-editorial-primary)",
  entity: "var(--editorial-semantic-success)",
  source: "var(--editorial-semantic-warning)",
  index: "var(--editorial-semantic-info)",
  // 知识形态 type（受控枚举）：每个独立颜色，来自 globals.css 的 --wiki-type-* 变量（明暗自适应）
  Concept: "var(--wiki-type-concept)",
  Principle: "var(--wiki-type-principle)",
  Method: "var(--wiki-type-method)",
  Technology: "var(--wiki-type-technology)",
  Application: "var(--wiki-type-application)",
  Trend: "var(--wiki-type-trend)",
  Reference: "var(--wiki-type-reference)",
  Metric: "var(--wiki-type-metric)",
};

/** 类型 → 中文标签。知识形态键来自 contracts 单一数据源。 */
export const WIKI_TYPE_LABELS: Record<string, string> = {
  concept: "概念",
  entity: "实体",
  source: "来源",
  reference: "引用",
  index: "索引",
  query: "查询",
  thesis: "论点",
  finding: "发现",
  methodology: "方法论",
  event: "事件",
  ...WIKI_CONCEPT_TYPE_LABELS,
};

/** 类型标签（跟随配置中心语言：zh 显示中文，其余显示英文 type）。 */
export function wikiTypeLabel(type: string, lang?: string): string {
  if (lang?.toLowerCase().startsWith("zh")) {
    // 优先小写键（历史值如 concept/reference），回退大写知识形态键（Method/Technology 等）
    return WIKI_TYPE_LABELS[type.toLowerCase()] ?? WIKI_TYPE_LABELS[type] ?? type;
  }
  return type;
}

export function wikiTypeColor(type: string): string {
  // 优先小写键（历史值如 concept/reference），回退大写知识形态键（Method/Technology 等）
  return (
    WIKI_TYPE_COLORS[type.toLowerCase()] ??
    WIKI_TYPE_COLORS[type] ??
    "var(--color-editorial-ink-muted)"
  );
}

/** 分组显示顺序：受控枚举在前，未知 type 由消费方归到最后。 */
export const WIKI_TYPE_ORDER: string[] = [...WIKI_CONCEPT_TYPES];

/** 按受控枚举顺序排序 type，未知 type 归到最后。 */
export function sortWikiTypes(types: string[]): string[] {
  const order = new Map(WIKI_TYPE_ORDER.map((t, i) => [t, i]));
  return types.toSorted((a, b) => {
    const ai = order.get(a) ?? WIKI_TYPE_ORDER.length;
    const bi = order.get(b) ?? WIKI_TYPE_ORDER.length;
    return ai - bi || a.localeCompare(b, "zh-CN");
  });
}
