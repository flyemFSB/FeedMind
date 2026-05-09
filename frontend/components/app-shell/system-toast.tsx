"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type ToastPayload = {
  message: string;
  type?: "error" | "info" | "success";
};

type ToastItem = Required<ToastPayload> & {
  id: number;
};

function getToastClass(type: ToastItem["type"]): string {
  if (type === "error") return "border-red-100 bg-red-50 text-red-600";
  if (type === "success") return "border-green-100 bg-green-50 text-green-700";
  return "border-[#d2d2d7] bg-white text-[#1d1d1f]";
}

export function SystemToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      if (!detail?.message) return;

      const id = Date.now();
      setToasts((items) => [
        ...items,
        {
          id,
          message: detail.message,
          type: detail.type ?? "info",
        },
      ]);
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== id));
      }, 3200);
    };

    window.addEventListener("feedmind:toast", handleToast);
    return () => window.removeEventListener("feedmind:toast", handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] shadow-xl ${getToastClass(toast.type)}`}
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#86868b] transition-colors hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
            aria-label="关闭提示"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      ))}
    </div>
  );
}
