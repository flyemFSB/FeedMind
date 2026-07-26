/**
 * OKF Tag Classification System
 *
 * 定义标准化标签分类体系，扩展 OKF 的 tags 字段
 * 遵循"轻量但结构化"原则：保持简单同时提供分类能力
 */

/**
 * 预定义标签分类（Category）
 * 用于自动将 concept type 映射到相应 tag
 */
export const TAG_CATEGORIES = {
  /** 数据类型 */
  DATASET: "Dataset",
  TABLE: "Table",
  VIEW: "View",
  MODEL: "Model",

  /** 接口与服务 */
  API: "API",
  ENDPOINT: "Endpoint",
  SERVICE: "Service",
  MICROSERVICE: "Microservice",

  /** 业务流程 */
  PLAYBOOK: "Playbook",
  PROCEDURE: "Procedure",
  POLICY: "Policy",
  GUIDELINE: "Guideline",

  /** 监控与指标 */
  METRIC: "Metric",
  DASHBOARD: "Dashboard",
  ALERT: "Alert",
  LOG: "Log",

  /** 参考文档 */
  REFERENCE: "Reference",
  GLOSSARY: "Glossary",
  TUTORIAL: "Tutorial",
  EXAMPLE: "Example",

  /** 基础设施 */
  DATABASE: "Database",
  CACHE: "Cache",
  QUEUE: "Queue",
  STORAGE: "Storage",

  /** 安全相关 */
  SECURITY_POLICY: "Security Policy",
  AUDIT: "Audit",
  COMPLIANCE: "Compliance",

  /** 临时状态 */
  DRAFT: "Draft",
  EXTERNAL: "External",
  ARCHIVED: "Archived",
} as const;

/** 标签值类型 */
export type TagValue = string;

/**
 * 概念元数据中的 status 字段
 * 表示概念的生命周期状态
 */
export const CONCEPT_STATUS = {
  DRAFT: "Draft",
  REVIEW: "In Review",
  PUBLISHED: "Published",
  DEPRECATED: "Deprecated",
  ARCHIVED: "Archived",
} as const;

export type ConceptStatus = (typeof CONCEPT_STATUS)[keyof typeof CONCEPT_STATUS];

/**
 * 目标受众分类
 * 帮助过滤和路由展示
 */
export const AUDIENCE = {
  TECHNICAL: "Technical",
  BUSINESS: "Business",
  EXECUTIVE: "Executive",
  GENERIC: "General",
  BOTH: "Both Technical and Business",
} as const;

export type AudienceType = (typeof AUDIENCE)[keyof typeof AUDIENCE];

/**
 * 领域/业务线分类
 */
export const DOMAIN = {
  SALES: "Sales",
  MARKETING: "Marketing",
  FINANCE: "Finance",
  HR: "Human Resources",
  OPERATIONS: "Operations",
  PRODUCT: "Product",
  ENGINEERING: "Engineering",
  DATA: "Data & Analytics",
  SECURITY: "Security",
  LEGAL: "Legal & Compliance",
} as const;

export type DomainType = (typeof DOMAIN)[keyof typeof DOMAIN];

/**
 * 推荐的概念类型模板
 */
export const CONCEPT_TYPE_TEMPLATES = [
  // Data concepts
  "BigQuery Table",
  "BigQuery Dataset",
  "Data Pipeline",
  "ETL Job",
  "Analytics View",

  // API concepts
  "API Endpoint",
  "REST Service",
  "GraphQL Schema",
  "gRPC Service",

  // Process concepts
  "Playbook",
  "Runbook",
  "Standard Operating Procedure",
  "Incident Response Plan",

  // Reference concepts
  "Glossary Term",
  "Style Guide",
  "Best Practice",
  "Decision Record",
] as const;

export type StandardConceptType = (typeof CONCEPT_TYPE_TEMPLATES)[number];

/**
 * 多语言翻译映射（可选扩展）
 */
export const TAG_TRANSLATIONS: Record<string, Record<string, string>> = {
  [TAG_CATEGORIES.DATASET]: {
    "zh-Hans": "数据集",
    ja: "データセット",
    ko: "데이터셋",
  },
  [TAG_CATEGORIES.API]: {
    "zh-Hans": "API",
    ja: "API",
    ko: "API",
  },
  [TAG_CATEGORIES.PLAYBOOK]: {
    "zh-Hans": "操作手册",
    ja: "プレイブック",
    ko: "플레이북",
  },
};

/**
 * 生成标准化标签列表
 * 输入任意字符串数组，输出规范化后的标签
 */
export function normalizeTags(input: string[] | undefined): TagValue[] {
  if (!input || input.length === 0) {
    return [];
  }

  const normalized = new Set<TagValue>();

  for (const tag of input) {
    const trimmed = tag.trim();
    if (!trimmed) continue;

    // 尝试匹配预定义分类
    const matched = Object.values(TAG_CATEGORIES).find(
      (category) => category.toLowerCase() === trimmed.toLowerCase(),
    );

    if (matched) {
      normalized.add(matched);
    } else {
      // 如果未匹配，作为自定义标签（首字母大写）
      normalized.add(trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
    }
  }

  // 按字母顺序排序
  return Array.from(normalized).sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * 为 concept 自动生成推荐标签
 */
export function autoGenerateTags(type: string): TagValue[] {
  const suggestions: TagValue[] = [];

  const lowerType = type.toLowerCase();

  // 基于类型名称推断
  if (lowerType.includes("table") || lowerType.includes("dataset")) {
    suggestions.push(TAG_CATEGORIES.DATASET);
  }

  if (
    lowerType.includes("api") ||
    lowerType.includes("endpoint") ||
    lowerType.includes("service")
  ) {
    suggestions.push(TAG_CATEGORIES.API);
  }

  if (lowerType.includes("playbook") || lowerType.includes("procedure")) {
    suggestions.push(TAG_CATEGORIES.PLAYBOOK);
  }

  if (lowerType.includes("metric") || lowerType.includes("dashboard")) {
    suggestions.push(TAG_CATEGORIES.METRIC);
  }

  return suggestions.length > 0 ? suggestions : [TAG_CATEGORIES.REFERENCE];
}

/**
 * 检查概念是否符合标准类型规范
 */
export function validateConceptType(type: string): {
  valid: boolean;
  suggestion?: StandardConceptType;
} {
  // 完全匹配
  if (CONCEPT_TYPE_TEMPLATES.includes(type as StandardConceptType)) {
    return { valid: true };
  }

  // 模糊匹配（前缀）
  const match = CONCEPT_TYPE_TEMPLATES.find((template) =>
    template.toLowerCase().startsWith(type.toLowerCase()),
  );

  if (match) {
    return { valid: false, suggestion: match };
  }

  return { valid: true }; // 允许自定义类型
}

/**
 * 从元数据中提取并验证 status 字段
 */
export function extractConceptStatus(
  frontmatter: Record<string, unknown>,
): ConceptStatus | undefined {
  const statusValue = frontmatter.status;

  if (!statusValue) return undefined;

  // 尝试匹配预定义状态
  const validStatuses = Object.values(CONCEPT_STATUS) as ConceptStatus[];
  if (typeof statusValue === "string" && validStatuses.includes(statusValue as ConceptStatus)) {
    return statusValue as ConceptStatus;
  }

  return undefined;
}

/**
 * 设置或更新概念状态
 */
export function setConceptStatus(
  frontmatter: Record<string, unknown>,
  status: ConceptStatus | undefined,
): Record<string, unknown> {
  const result = { ...frontmatter };

  if (status === undefined) {
    delete result.status;
  } else {
    result.status = status;
  }

  return result;
}

/**
 * 计算概念的优先级（基于状态和标签）
 */
export function calculatePriority(status?: ConceptStatus, tags?: string[]): number {
  let priority = 0;

  // 状态权重
  switch (status) {
    case "Published":
      priority += 30;
      break;
    case "In Review":
      priority += 20;
      break;
    case "Deprecated":
      priority -= 10;
      break;
    default:
      priority += 10;
  }

  // 标签权重
  if (tags?.some((t) => t.toLowerCase().includes("api"))) {
    priority += 15;
  }

  if (
    tags?.some((t) => t.toLowerCase().includes("policy") || t.toLowerCase().includes("security"))
  ) {
    priority += 20;
  }

  return priority;
}

/**
 * 按标签分组概念
 */
export function groupByTags(concepts: Array<{ tags?: string[] }>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const concept of concepts) {
    if (!concept.tags) continue;

    for (const tag of concept.tags) {
      const existing = counts.get(tag) ?? 0;
      counts.set(tag, existing + 1);
    }
  }

  return counts;
}
