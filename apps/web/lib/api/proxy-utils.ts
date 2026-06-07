/**
 * Shared utilities for API proxy server routes.
 *
 * Validates upstream URLs, filters dangerous headers, and provides
 * consistent error responses — preventing SSRF and header injection.
 */

// Hop-by-hop headers that MUST NOT be forwarded (RFC 2616 §13.5.1)
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

// Headers that should be sanitized for proxy safety
const FORBIDDEN_HEADERS = new Set([
  "origin",
  "referer",
]);

/**
 * Validate an upstream URL to prevent SSRF and malformed requests.
 * Returns the validated URL string or throws a descriptive error.
 */
export function validateUpstreamUrl(baseUrl: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
  } catch {
    throw new Error(`PROXY_ERR: Invalid upstream URL — base="${baseUrl}" path="${path}"`);
  }

  // Only allow http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`PROXY_ERR: Blocked non-http protocol "${url.protocol}"`);
  }

  // Block localhost / private IP SSRF in remote production deployments.
  // Local/Electron production mode can opt out by setting ALLOW_LOCAL_UPSTREAM=true.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_UPSTREAM !== "true"
  ) {
    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("192.168.")
    ) {
      throw new Error(`PROXY_ERR: Blocked private IP SSRF attempt — "${hostname}"`);
    }
  }

  return url;
}

/**
 * Filter request headers for safe proxying.
 * Removes hop-by-hop headers and any forbidden headers.
 */
export function filterProxyHeaders(source: Headers): Headers {
  const out = new Headers();

  for (const [key, value] of source) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (FORBIDDEN_HEADERS.has(lower)) continue;
    out.set(key, value);
  }

  return out;
}

/**
 * Build a fetch RequestInit from an incoming Request, with safe defaults.
 */
export function buildProxyInit(
  request: Request,
  validatedHeaders: Headers,
): RequestInit & { duplex?: "half" } {
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: validatedHeaders,
    cache: "no-store",
    redirect: "manual",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  return init;
}

/**
 * Create a standardized error response for proxy failures.
 */
export function proxyErrorResponse(
  status: number,
  message: string,
): Response {
  return new Response(
    JSON.stringify({ error: { code: "PROXY_ERR", message } }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}
