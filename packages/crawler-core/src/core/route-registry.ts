/**
 * Route registry: maps route names (e.g. "tieba/forum") to handler functions.
 *
 * Each route file registers itself at import time via registerRoute().
 * The registry is used by the API layer to dispatch tasks to handlers.
 */

import type { RouteHandler } from "./types.js";

const registry = new Map<string, RouteHandler>();

/**
 * Register a route handler.
 * Called at module import time by each route file.
 */
export function registerRoute(name: string, handler: RouteHandler): void {
  if (registry.has(name)) {
    throw new Error(`Route "${name}" is already registered`);
  }
  registry.set(name, handler);
}

/**
 * Get a route handler by name.
 * Returns undefined if the route is not registered.
 */
export function getRouteHandler(name: string): RouteHandler | undefined {
  return registry.get(name);
}

/**
 * List all registered route names.
 */
export function listRoutes(): string[] {
  return [...registry.keys()];
}
