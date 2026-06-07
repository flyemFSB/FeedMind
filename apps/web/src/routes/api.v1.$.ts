import { createFileRoute } from "@tanstack/react-router";
import {
  validateUpstreamUrl,
  filterProxyHeaders,
  buildProxyInit,
  proxyErrorResponse,
} from "@/lib/api/proxy-utils";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://localhost:8000";

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: proxyToBackend,
      POST: proxyToBackend,
      PUT: proxyToBackend,
      PATCH: proxyToBackend,
      DELETE: proxyToBackend,
      OPTIONS: proxyToBackend,
    },
  },
});

async function proxyToBackend({
  request,
  params,
}: { request: Request; params: { _splat?: string } }) {
  try {
    const requestUrl = new URL(request.url);
    const upstreamUrl = validateUpstreamUrl(
      BACKEND_API_URL,
      `api/v1/${params._splat ?? ""}`,
    );
    upstreamUrl.search = requestUrl.search;

    const headers = filterProxyHeaders(request.headers);
    const init = buildProxyInit(request, headers);

    const upstreamResponse = await fetch(upstreamUrl, init);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown proxy error";
    if (message.startsWith("PROXY_ERR")) {
      console.warn("[backend-proxy]", message);
      return proxyErrorResponse(502, message);
    }
    console.error("[backend-proxy]", message);
    return proxyErrorResponse(502, "后端代理请求失败");
  }
}
