"use client";

import { memo } from "react";
import type { ReactNode } from "react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import type {
  StreamdownTextComponents,
  SyntaxHighlighterProps,
} from "@assistant-ui/react-streamdown";
import { cjk } from "@streamdown/cjk";
import { openPreview } from "@/lib/preview-events";

function SyntaxHighlighter({ code, language }: SyntaxHighlighterProps) {
  const displayCode = code.replace(/^\n+|\n+$/g, "");

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-[#d8d8de] bg-[#fbfbfd]">
      <div className="flex h-9 items-center border-b border-[#d8d8de] bg-[#f5f5f7] px-3">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[#6e6e73]">
          {language || "text"}
        </span>
      </div>
      <pre className="m-0 max-w-full overflow-x-auto bg-transparent p-4 text-[12px] leading-5 text-[#1d1d1f]">
        <code
          className="block whitespace-pre font-mono"
          data-language={language || undefined}
        >
          {displayCode}
        </code>
      </pre>
    </div>
  );
}

type MarkdownComponentProps = {
  children?: ReactNode;
  href?: string;
};

const markdownComponents = {
  h1: ({ children }: MarkdownComponentProps) => <h1 className="text-[17px] font-semibold mt-4 mb-2">{children}</h1>,
  h2: ({ children }: MarkdownComponentProps) => <h2 className="text-[15px] font-semibold mt-4 mb-2">{children}</h2>,
  h3: ({ children }: MarkdownComponentProps) => <h3 className="text-[14px] font-semibold mt-3 mb-1.5">{children}</h3>,
  p: ({ children }: MarkdownComponentProps) => <p className="text-[14px] leading-relaxed mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: MarkdownComponentProps) => <ul className="mb-3 list-disc pl-5 marker:text-[#0071e3]">{children}</ul>,
  ol: ({ children }: MarkdownComponentProps) => <ol className="mb-3 list-decimal pl-5">{children}</ol>,
  li: ({ children }: MarkdownComponentProps) => (
    <li className="text-[13px] leading-relaxed marker:text-[#0071e3]">
      {children}
    </li>
  ),
  table: ({ children }: MarkdownComponentProps) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-[#d8d8de] bg-white">
      <table className="w-full min-w-max border-collapse text-left text-[12px] leading-5">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: MarkdownComponentProps) => (
    <thead className="bg-[#f5f5f7] text-[#1d1d1f]">{children}</thead>
  ),
  tbody: ({ children }: MarkdownComponentProps) => (
    <tbody className="divide-y divide-[#e8e8ed]">{children}</tbody>
  ),
  tr: ({ children }: MarkdownComponentProps) => (
    <tr className="transition-colors hover:bg-[#fbfbfd]">{children}</tr>
  ),
  th: ({ children }: MarkdownComponentProps) => (
    <th className="border-r border-[#e8e8ed] px-3 py-2.5 font-semibold last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }: MarkdownComponentProps) => (
    <td className="border-r border-[#f0f0f3] px-3 py-2.5 align-top text-[#1d1d1f] last:border-r-0">
      {children}
    </td>
  ),
  a: ({ href, children }: MarkdownComponentProps) => (
    <a
      href={href}
      className="text-[#0066cc] hover:underline text-[13px]"
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        const title = readText(children).trim();
        openPreview({
          title: title && title !== href ? title : undefined,
          url: href,
          source: href,
        });
      }}
    >
      {children}
    </a>
  ),
  SyntaxHighlighter,
  code: ({ children }: MarkdownComponentProps) => (
    <code className="px-1.5 py-0.5 rounded-md bg-[#f5f5f7] text-[12px] font-mono text-[#1d1d1f]">
      {children}
    </code>
  ),
  pre: ({ children }: MarkdownComponentProps) => (
    <pre className="my-3 max-w-full overflow-x-auto rounded-lg border border-[#d8d8de] bg-[#fbfbfd] p-4 text-[12px] leading-5 text-[#1d1d1f]">
      {children}
    </pre>
  ),
};

function readText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(readText).join("");
  return "";
}

// Streamdown 的逐字符动画为流式文本提供打字机效果；cjk 插件确保中日韩字符正确换行
export const MarkdownText = memo(function MarkdownText() {
  return (
    <StreamdownTextPrimitive
      mode="streaming"
      caret="block"
      controls={false}
      animated={{
        sep: "char",
        stagger: 12,
        duration: 120,
        animation: "fadeIn",
      }}
      className="prose prose-sm max-w-none prose-headings:text-[#1d1d1f] prose-headings:font-semibold prose-p:text-[#1d1d1f] prose-p:leading-relaxed prose-a:text-[#0066cc] prose-a:no-underline hover:prose-a:underline prose-strong:text-[#1d1d1f] prose-strong:font-semibold prose-li:text-[#1d1d1f] prose-ul:space-y-1 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none"
      components={markdownComponents as StreamdownTextComponents}
      plugins={{ cjk }}
    />
  );
});
