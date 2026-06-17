import { type ComponentType, useEffect, useState } from "react";

const devtoolsEnabled = import.meta.env.DEV;

const loadQueryDevtools = () =>
  import("@tanstack/react-query-devtools").then((res) => res.ReactQueryDevtools);

function useIdleDevtools(load: () => Promise<ComponentType>) {
  const [Devtools, setDevtools] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const loadDevtools = () => {
      load().then((component) => {
        if (!cancelled) setDevtools(() => component);
      });
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(loadDevtools, { timeout: 3000 });
    } else {
      timeoutId = globalThis.setTimeout(loadDevtools, 2500);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, [load]);

  return Devtools;
}

export function TanStackQueryDevtools() {
  const Devtools = useIdleDevtools(loadQueryDevtools);
  if (!devtoolsEnabled) return null;
  if (!Devtools) return null;
  return <Devtools />;
}
