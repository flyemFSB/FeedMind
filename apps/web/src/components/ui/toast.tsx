import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  XIcon,
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const rawToast = ToastPrimitive.createToastManager();

const DEFAULT_TIMEOUTS: Record<string, number> = {
  success: 3000,
  info: 4000,
  warning: 4500,
  error: 6000,
};

const recentToasts = new Map<string, number>();
const DEDUPE_INTERVAL_MS = 1500;

type ToastAddOptions = Parameters<typeof rawToast.add>[0];

function addToast(options: ToastAddOptions): string {
  const type = options.type ?? "info";
  const titleKey = typeof options.title === "string" ? options.title : "";
  const descKey = typeof options.description === "string" ? options.description : "";
  const key = `${type}:${titleKey}:${descKey}`;

  if (key) {
    const now = Date.now();
    const lastTime = recentToasts.get(key);
    if (lastTime && now - lastTime < DEDUPE_INTERVAL_MS) {
      // 1.5 秒内相同类型与标题的提示直接抑制，避免并发错误或快速重复点击刷屏
      return "";
    }
    recentToasts.set(key, now);
    if (recentToasts.size > 50) {
      for (const [k, time] of recentToasts.entries()) {
        if (now - time > 10000) recentToasts.delete(k);
      }
    }
  }

  const timeout = options.timeout ?? DEFAULT_TIMEOUTS[type];
  return rawToast.add({
    ...options,
    ...(timeout != null ? { timeout } : {}),
  });
}

const toast = Object.assign(rawToast, {
  add: addToast,
  success: (title: React.ReactNode, options?: Omit<ToastAddOptions, "title" | "type">) =>
    addToast({ ...options, title, type: "success" }),
  error: (title: React.ReactNode, options?: Omit<ToastAddOptions, "title" | "type">) =>
    addToast({ ...options, title, type: "error" }),
  warning: (title: React.ReactNode, options?: Omit<ToastAddOptions, "title" | "type">) =>
    addToast({ ...options, title, type: "warning" }),
  info: (title: React.ReactNode, options?: Omit<ToastAddOptions, "title" | "type">) =>
    addToast({ ...options, title, type: "info" }),
});

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed top-4 inset-x-0 z-[60] mx-auto w-[calc(100vw-2rem)] max-w-sm outline-none",
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group/toast pointer-events-auto absolute top-0 right-0 left-0 z-[calc(1000-var(--toast-index))] w-full origin-top rounded-2xl border bg-popover text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_360ms_cubic-bezier(0.22,1,0.36,1),opacity_240ms,height_180ms]",
        "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(-150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className,
      )}
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}: ToastPrimitive.Close.Props) {
  const { t } = useTranslation();
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label={t("common.close")}
      render={render}
      className={cn(
        "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null;

  if (type === "success") {
    icon = <CircleCheckIcon className="text-editorial-semantic-success" aria-hidden="true" />;
  }

  if (type === "info") {
    icon = <InfoIcon className="text-editorial-semantic-info" aria-hidden="true" />;
  }

  if (type === "warning") {
    icon = <TriangleAlertIcon className="text-editorial-semantic-warning" aria-hidden="true" />;
  }

  if (type === "error") {
    icon = <OctagonXIcon className="text-editorial-semantic-error" aria-hidden="true" />;
  }

  if (type === "loading") {
    icon = <Loader2Icon className="animate-spin text-editorial-primary" aria-hidden="true" />;
  }

  if (!icon) {
    return null;
  }

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem} swipeDirection="up">
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function Toaster({ children, toastManager = toast, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

export { Toaster, toast };
