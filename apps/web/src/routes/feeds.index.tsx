import { createFileRoute } from "@tanstack/react-router";
import { FeedsIndexPage } from "@/pages/feeds/feeds-page";

// 字段显式含 undefined：validateSearch 用 undefined 表示"移除该参数"，
// exactOptionalPropertyTypes 下需在类型中声明 undefined 才能返回 { filter: undefined }
type FeedsIndexSearch = {
  filter?: string | undefined;
  keyword?: string | undefined;
};

export const Route = createFileRoute("/feeds/")({
  // 筛选与关键词放入 URL search params：可分享/刷新保留，官方推荐替代组件内 useState
  validateSearch: (search: Record<string, unknown>): FeedsIndexSearch => ({
    filter: typeof search["filter"] === "string" ? search["filter"] : undefined,
    keyword: typeof search["keyword"] === "string" ? search["keyword"] : undefined,
  }),
  component: FeedsIndexPage,
});
