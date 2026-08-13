import { beforeEach, describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { errorMessage } from "./client";

// 回归测试：错误响应必须给出语义化消息（词条/信封 message 兜底），
// 而不是退化成「服务器暂时不可用」这类丢失原因的模糊状态码文案
// 固定测试语言：errorMessage 依赖 i18n 当前语言，CI 与本地对语言检测
// （navigator/localStorage）结果可能不同，不固定会产生环境相关 flaky
describe("errorMessage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  it("信封错误透传业务 message（如 Cookie 失效），不落状态码兜底", async () => {
    const res = new Response(
      JSON.stringify({
        data: null,
        error: { code: "COOKIE_EXPIRED", message: "Cookie 已失效，请重新同步" },
      }),
      { status: 401 },
    );
    expect(await errorMessage(res)).toBe("Cookie 已失效，请重新同步");
  });

  it("非信封响应体（网关 HTML 等）回退状态码兜底文案", async () => {
    const res = new Response("<html>Bad Gateway</html>", { status: 502 });
    expect(await errorMessage(res)).toBe("网关响应异常，请稍后重试");
  });

  it("空响应体回退状态码兜底文案", async () => {
    const res = new Response(null, { status: 500 });
    expect(await errorMessage(res)).toBe("操作未完成，请重试；若持续失败请反馈");
  });

  it("未知状态码回退带状态码的通用文案", async () => {
    const res = new Response(null, { status: 599 });
    expect(await errorMessage(res)).toBe("请求失败（599）");
  });

  it("英文界面返回英文词条", async () => {
    await i18n.changeLanguage("en-US");
    const res = new Response(null, { status: 500 });
    expect(await errorMessage(res)).toBe(
      "The operation failed. Please retry; if the issue persists, please report it",
    );
  });
});
