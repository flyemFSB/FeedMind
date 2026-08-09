/**
 * 爬虫认证错误：登录态失效（Cookie 过期 / 未登录）。
 *
 * 路由处理器在无法证明登录态有效时抛出，api 层据此透出 401，
 * 而不是与"网络波动 / 无数据"一起静默降级成空列表。
 */
export class CrawlerAuthError extends Error {
  readonly code = "AUTH_FAILED" as const;

  constructor(message = "登录态已失效") {
    super(message);
    this.name = "CrawlerAuthError";
  }
}
