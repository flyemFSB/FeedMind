import { type ComponentType, useEffect, useState } from "react";

export function TanStackRouterDevtools() {
  if (import.meta.env.PROD) return null;
  const [Devtools, setDevtools] = useState<ComponentType | null>(null);
  useEffect(() => {
    import("@tanstack/react-router-devtools").then((res) =>
      setDevtools(() => res.TanStackRouterDevtools),
    );
  }, []);
  if (!Devtools) return null;
  return <Devtools />;
}

export function TanStackQueryDevtools() {
  if (import.meta.env.PROD) return null;
  const [Devtools, setDevtools] = useState<ComponentType | null>(null);
  useEffect(() => {
    import("@tanstack/react-query-devtools").then((res) =>
      setDevtools(() => res.ReactQueryDevtools),
    );
  }, []);
  if (!Devtools) return null;
  return <Devtools />;
}
