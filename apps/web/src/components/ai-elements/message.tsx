import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { loadMathPlugin } from "@/lib/math-mathjax";
import { normalizeMathMarkdown } from "@/lib/math-normalize";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { Streamdown, type MathPlugin, type DiagramPlugin } from "streamdown";
import { useTranslation } from "react-i18next";
import { streamdownTranslations } from "@/lib/streamdown-i18n";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({ className, children, ...props }: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  label?: string;
};

export const MessageAction = ({
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => (
  <Button size={size} type="button" variant={variant} {...props}>
    {children}
    <span className="sr-only">{label}</span>
  </Button>
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

// math（mathjax-full ~2MB）与 mermaid（~1MB+）渲染器都是重库：
// 静态 import 会让它们全部进首屏加载链。改为挂载后异步加载：
// 首屏只含 streamdown 核心，消息里出现公式/图表时才下载渲染器。
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    const { t } = useTranslation();
    const [mathPlugin, setMathPlugin] = useState<MathPlugin | null>(null);
    const [mermaidPlugin, setMermaidPlugin] = useState<DiagramPlugin | null>(null);

    useEffect(() => {
      let cancelled = false;
      // 动态导入失败按「无插件」降级：catch 兜底，避免 unhandled rejection
      void loadMathPlugin()
        .then((p) => {
          if (!cancelled) setMathPlugin(p);
        })
        .catch(() => {});
      void import("@streamdown/mermaid")
        .then((m) => {
          if (!cancelled) setMermaidPlugin(m.mermaid);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);

    const plugins = useMemo(
      () => ({
        cjk,
        ...(mathPlugin ? { math: mathPlugin } : {}),
        ...(mermaidPlugin ? { mermaid: mermaidPlugin } : {}),
      }),
      [mathPlugin, mermaidPlugin],
    );

    // t 引用在语言切换时才变化；对象身份稳定以避免击穿 Streamdown 的 memo
    const translations = useMemo(() => streamdownTranslations(t), [t]);

    const normalizedChildren = useMemo(() => {
      if (typeof props.children === "string") {
        return normalizeMathMarkdown(props.children);
      }
      return props.children;
    }, [props.children]);

    return (
      <Streamdown
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        plugins={plugins}
        translations={translations}
        {...props}
      >
        {normalizedChildren}
      </Streamdown>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
