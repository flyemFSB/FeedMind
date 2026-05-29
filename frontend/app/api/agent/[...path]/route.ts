const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:2024";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxyToAgent(request: Request, { params }: RouteContext) {
  const { path } = await params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(path.join("/"), `${AGENT_API_URL.replace(/\/$/, "")}/`);
  upstreamUrl.search = requestUrl.search;

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(upstreamUrl, init);

  const headers = new Headers(upstreamResponse.headers);
  headers.set("Cache-Control", "no-cache, no-transform");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export function GET(request: Request, context: RouteContext) {
  return proxyToAgent(request, context);
}

export function POST(request: Request, context: RouteContext) {
  return proxyToAgent(request, context);
}
