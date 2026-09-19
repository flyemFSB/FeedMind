import { createFileRoute } from "@tanstack/react-router";

/** 聊天路由重定向占位：访问时由全局外壳接管展开智能体抽屉并导航到 Wiki 页面 */
export const Route = createFileRoute("/chat")({
  component: () => null,
});
