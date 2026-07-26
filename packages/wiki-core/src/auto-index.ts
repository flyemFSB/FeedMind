/**
 * Auto-index Generator for OKF v0.1
 *
 * 自动生成符合 OKF规范的index.md文件，支持 progressive disclosure
 * 参考：https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md#6-index-files
 */

import type { WikiPageListItem } from "@feedmind/contracts";

/** Index 条目的数据结构 */
export interface IndexItem {
  /** Concept ID 或路径 */
  path: string;
  /** 显示标题 */
  title: string;
  /** 简短描述 */
  description?: string;
  /** 分类标签（用于分组） */
  category?: string;
  /** 是否为目标文件夹 */
  isDirectory?: boolean;
}

/** 生成器配置选项 */
export interface AutoIndexOptions {
  /** 按类型分组（默认：true） */
  groupByType?: boolean;
  /** 自定义分类映射 */
  typeCategories?: Record<string, string>;
  /** 包含描述（默认：true） */
  includeDescriptions?: boolean;
  /** 排序方式：'name'|'timestamp'|'type' */
  sortBy?: "name" | "timestamp" | "type";
  /** 添加手动入口链接 */
  manualLinks?: Array<{ title: string; url: string; description?: string }>;
}

/**
 * 根据概念列表自动生成 index.md 内容
 */
export function generateIndex(items: IndexItem[], options: AutoIndexOptions = {}): string {
  const {
    groupByType = true,
    typeCategories = {},
    includeDescriptions = true,
    sortBy = "name",
    manualLinks = [],
  } = options;

  // 按指定方式排序
  const sortedItems = sortItems(items, sortBy);

  // 分组逻辑
  let groupedItems: Map<string, IndexItem[]>;
  if (groupByType) {
    groupedItems = groupByCategory(sortedItems, typeCategories);
  } else {
    groupedItems = new Map([["全部概念", sortedItems]]);
  }

  // 构建 markdown
  let markdown = "";

  // 添加手动链接（如果有）
  if (manualLinks.length > 0) {
    markdown += "### 外部资源\n\n";
    for (const link of manualLinks) {
      const desc = includeDescriptions && link.description ? ` - ${link.description}` : "";
      markdown += `* [${link.title}](${link.url})${desc}\n`;
    }
    markdown += "\n";
  }

  // 添加分类区块
  let hasGroupedContent = false;
  for (const [category, items] of groupedItems) {
    if (items.length === 0) continue;

    // 跳过仅有一个元素的分类（如果未启用分组）
    if (!groupByType && items.length === 1 && !hasGroupedContent) {
      for (const item of items) {
        markdown += formatSingleLink(item, includeDescriptions);
      }
      continue;
    }

    hasGroupedContent = true;
    markdown += `### ${formatCategoryName(category)}\n\n`;

    for (const item of items) {
      markdown += formatSingleLink(item, includeDescriptions);
    }

    markdown += "\n";
  }

  return markdown.trim() + "\n";
}

/**
 * 格式化单个链接条目
 */
function formatSingleLink(item: IndexItem, includeDescription: boolean): string {
  const normalizedPath = item.path.replace(/\\/g, "/").replace(/^\/+/, "");
  const url = item.isDirectory
    ? `/${normalizedPath.replace(/\/$/, "")}/`
    : `/${normalizedPath.replace(/\.md$/i, "")}.md`;
  const description = includeDescription && item.description ? ` - ${item.description}` : "";

  // 如果是文件夹，显示目录图标
  const icon = item.isDirectory ? "📁 " : "";

  return `${icon}* [${item.title}](${url})${description}\n`;
}

/**
 * 对 items 进行排序
 */
function sortItems(items: IndexItem[], sortBy: "name" | "timestamp" | "type"): IndexItem[] {
  const sorted = [...items];

  switch (sortBy) {
    case "name":
      sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans"));
      break;

    case "timestamp":
      // 假设 item.path 中包含 timestamp 信息或从元数据获取
      sorted.sort((a, b) => {
        const dateA = extractTimestampFromPath(a.path);
        const dateB = extractTimestampFromPath(b.path);
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      break;

    case "type":
      sorted.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""));
      break;
  }

  return sorted;
}

/**
 * 按分类分组 items
 */
function groupByCategory(
  items: IndexItem[],
  customCategories: Record<string, string>,
): Map<string, IndexItem[]> {
  const grouped = new Map<string, IndexItem[]>();

  for (const item of items) {
    const categoryKey = getEffectiveCategory(item, customCategories);
    const list = grouped.get(categoryKey) ?? [];
    list.push(item);
    grouped.set(categoryKey, list);
  }

  // 按类别名称排序
  const sortedMap = new Map(
    Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans")),
  );

  return sortedMap;
}

/**
 * 计算有效分类
 */
function getEffectiveCategory(item: IndexItem, customCategories: Record<string, string>): string {
  // 优先使用自定义分类映射
  if (customCategories[item.category ?? ""]) {
    return customCategories[item.category ?? ""];
  }

  // 否则使用原始分类
  return item.category ?? "其他";
}

/**
 * 美化分类名称
 */
function formatCategoryName(name: string): string {
  // 将分类名首字母大写并空格化
  return name
    .replace(/[-_]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * 从路径中提取时间戳（格式：YYYY-MM-DD）
 */
function extractTimestampFromPath(path: string): string {
  const match = path.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "1970-01-01";
}

/**
 * 从 WikiPageListItem 转换为 IndexItem
 */
export function toItem(item: WikiPageListItem): IndexItem {
  return {
    path: item.concept_id,
    title: item.title,
    description: item.description,
    category: item.type, // 复用 type 字段作为分类
  };
}

/**
 * 为特定目录生成 index.md
 * 支持递归扫描子目录
 */
export async function generateDirectoryIndex(
  directoryItems: IndexItem[],
  options: AutoIndexOptions = {},
): Promise<string> {
  const { groupByType = true, ...rest } = options;

  // 分离文件和文件夹
  const files = directoryItems.filter((i) => !i.isDirectory);
  const directories = directoryItems.filter((i) => i.isDirectory);

  let markdown = "";

  // 添加子目录
  if (directories.length > 0) {
    markdown += "### 目录\n\n";
    for (const dir of directories.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans"))) {
      markdown += `* [${dir.title}](${dir.path}/)\n`;
    }
    markdown += "\n";
  }

  // 添加文件列表
  if (files.length > 0) {
    const fileIndex = generateIndex(files, { ...rest, groupByType });
    if (fileIndex) {
      markdown += fileIndex;
    }
  }

  return markdown.trim() + "\n";
}

/**
 * 深度生成多级索引
 * 适用于大型知识库
 */
export async function generateDeepIndex(
  allItems: IndexItem[],
  depth: number = 2,
  options: AutoIndexOptions = {},
): Promise<string> {
  const { groupByType = true, ...rest } = options;

  // 提取顶级目录
  const topLevelDirs = new Set<string>();
  for (const item of allItems) {
    const parts = item.path.split("/");
    if (parts.length > 1) {
      topLevelDirs.add(parts[0]);
    }
  }

  let markdown = "";

  if (topLevelDirs.size > 0) {
    markdown += "# 概览\n\n";

    for (const dir of Array.from(topLevelDirs).sort()) {
      const dirItems = allItems.filter((i) => i.path.startsWith(dir + "/"));
      const shortPath = dirItems[0]?.path.replace(dir + "/", "") ?? "";

      markdown += `### [${dir}](/${dir}/)\n\n`;
      markdown += `${shortPath ? `${shortPath} 下的` : "本目录的"}概念概览。\n\n`;

      if (depth > 1) {
        const subIndex = generateIndex(dirItems.slice(0, 10), {
          ...rest,
          groupByType,
          includeDescriptions: false,
        });
        if (subIndex) {
          markdown += `**精选主题**：\n\n${subIndex}`;
        }
      }

      markdown += "---\n\n";
    }
  }

  return markdown;
}
