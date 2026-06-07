import { type ComponentType, lazy } from "react";

export const TanStackRouterDevtools: ComponentType = import.meta.env.PROD || import.meta.env.SSR
  ? () => null
  : lazy(() =>
      import("@tanstack/react-router-devtools").then((res) => ({
        default: res.TanStackRouterDevtools,
      })),
    );

export const TanStackQueryDevtools: ComponentType = import.meta.env.PROD || import.meta.env.SSR
  ? () => null
  : lazy(() =>
      import("@tanstack/react-query-devtools").then((res) => ({
        default: res.ReactQueryDevtools,
      })),
    );
