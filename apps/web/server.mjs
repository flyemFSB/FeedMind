/**
 * FeedMind production server.
 *
 * Wraps the TanStack Start SSR handler (a Web-standard fetch handler)
 * with a Node.js HTTP server that also serves static assets from dist/client/.
 *
 * Usage:  node server.mjs
 *         PORT=3000 node server.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";

const CLIENT_DIR = new URL("./dist/client/", import.meta.url);
const SERVER_ENTRY = "./dist/server/server.js";

const MIME_TYPES = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const { default: serverEntry } = await import(SERVER_ENTRY);

createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${req.headers.host || HOST}`,
    );

    // --- Static assets from dist/client/ ---
    const filePath = join(CLIENT_DIR.pathname, url.pathname);
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      const content = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type":
          MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control":
          ext === ".js" || ext === ".css"
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
      });
      res.end(content);
      return;
    }

    // --- Convert Node.js IncomingMessage → Web Request ---
    let body = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () =>
          resolve(chunks.length > 0 ? Buffer.concat(chunks) : null),
        );
      });
    }

    const webResponse = await serverEntry.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers,
        body,
      }),
    );

    // --- Convert Web Response → Node.js response ---
    const responseHeaders = Object.fromEntries(webResponse.headers);
    res.writeHead(webResponse.status, responseHeaders);

    if (webResponse.body) {
      for await (const chunk of webResponse.body) {
        res.write(chunk);
      }
    }
    res.end();
  } catch (err) {
    console.error("[server.mjs]", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, HOST, () => {
  console.log(`FeedMind production server → http://${HOST}:${PORT}`);
});
