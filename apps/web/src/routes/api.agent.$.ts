import { createFileRoute } from "@tanstack/react-router";
import {
  validateUpstreamUrl,
  filterProxyHeaders,
  buildProxyInit,
  proxyErrorResponse,
} from "@/lib/api/proxy-utils";

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:2024";

export const Route = createFileRoute("/api/agent/$")({
  server: {
    handlers: {
      GET: proxyToAgent,
      POST: proxyToAgent,
      PUT: proxyToAgent,
      PATCH: proxyToAgent,
      DELETE: proxyToAgent,
      OPTIONS: proxyToAgent,
    },
  },
});

async function proxyToAgent({
  request,
  params,
}: { request: Request; params: { _splat?: string } }) {
  try {
    const requestUrl = new URL(request.url);
    const upstreamUrl = validateUpstreamUrl(
      AGENT_API_URL,
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
      console.warn("[agent-proxy]", message);
      return proxyErrorResponse(502, message);
    }
    console.error("[agent-proxy]", message);
    return proxyErrorResponse(502, "代理请求失败");
  }
}
