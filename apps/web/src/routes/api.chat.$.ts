import { createFileRoute } from "@tanstack/react-router";
import {
  validateUpstreamUrl,
  filterProxyHeaders,
  buildProxyInit,
  proxyErrorResponse,
} from "@/lib/api/proxy-utils";

const AGENT_CHAT_API_URL = process.env.AGENT_CHAT_API_URL ?? "http://127.0.0.1:8000/v1/agent/chat";

export const Route = createFileRoute("/api/chat/$")({
  server: {
    handlers: {
      GET: proxyToAgentChat,
      POST: proxyToAgentChat,
      PUT: proxyToAgentChat,
      PATCH: proxyToAgentChat,
      DELETE: proxyToAgentChat,
      OPTIONS: proxyToAgentChat,
    },
  },
});

async function proxyToAgentChat({
  request,
  params,
}: { request: Request; params: { _splat?: string } }) {
  try {
    const requestUrl = new URL(request.url);
    const upstreamUrl = validateUpstreamUrl(
      AGENT_CHAT_API_URL,
      params._splat ?? "",
    );
    upstreamUrl.search = requestUrl.search;

    const headers = filterProxyHeaders(request.headers);
    const init = buildProxyInit(request, headers);

    const upstreamResponse = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set("Cache-Control", "no-cache, no-transform");

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown proxy error";
    if (message.startsWith("PROXY_ERR")) {
      console.warn("[agent-chat-proxy]", message);
      return proxyErrorResponse(502, message);
    }
    console.error("[agent-chat-proxy]", message);
    return proxyErrorResponse(502, "代理请求失败");
  }
}
