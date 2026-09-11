import { createFileRoute } from "@tanstack/react-router";
import { MyWikiPage } from "@/pages/wiki/wiki-page";
import { VALID_VIEWS, type WikiView } from "@/lib/wiki-search";

type WikiSearch = {
  // 字段显式含 undefined：validateSearch/navigate 用 undefined 表示"移除该参数"，
  // exactOptionalPropertyTypes 下需在类型中声明 undefined 才能返回 { page: undefined }
  view?: WikiView | undefined;
  space?: string | undefined;
  page?: string | undefined;
};

export const Route = createFileRoute("/wiki")({
  // 子视图/空间/页面存于 URL search params：可分享/刷新保留，官方推荐替代组件内 useState
  validateSearch: (search: Record<string, unknown>): WikiSearch => ({
    view: VALID_VIEWS.includes(search["view"] as WikiView)
      ? (search["view"] as WikiView)
      : undefined,
    space: typeof search["space"] === "string" ? search["space"] : undefined,
    page: typeof search["page"] === "string" ? search["page"] : undefined,
  }),
  component: MyWikiPage,
});
