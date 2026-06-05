"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Info, Play, RefreshCw } from "lucide-react";
import type { LintResult } from "@feedmind/contracts";
import { runLint, getLintItems } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiLintViewProps {
  spaceId: string;
  onPageSelect?: (pageId: string) => void;
}

const LINT_ICONS: Record<string, React.ElementType> = {
  warning: AlertTriangle,
  info: Info,
};

const LINT_COLORS: Record<string, string> = {
  warning: "#ff9500",
  info: "#0071e3",
};

export function WikiLintView({ spaceId, onPageSelect }: WikiLintViewProps) {
  const [items, setItems] = useState<LintResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLintItems(spaceId);
      setItems(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleRunLint = async () => {
    setRunning(true);
    try {
      const result = await runLint(spaceId);
      setItems(result);
    } finally {
      setRunning(false);
    }
  };

  const bySeverity = (sev: string) => items.filter((i) => i.severity === sev);
  const warnings = bySeverity("warning");
  const infos = bySeverity("info");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Lint</h2>
          <p className="mt-0.5 text-[11px] text-[#86868b]">
            {items.length} issues ({warnings.length} warnings, {infos.length} info)
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleRunLint}
          disabled={running}
          className="h-8 gap-1.5 rounded-lg bg-[#0071e3] px-3 text-[12px] text-white hover:bg-[#0066cc]"
        >
          {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
          Run
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4">
                <Skeleton className="mb-1 h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-24 text-center">
            <Info size={32} className="mb-3 text-[#34c759]" />
            <p className="text-[13px] font-medium text-[#1d1d1f]">No issues found</p>
            <p className="mt-1 text-[11px] text-[#86868b]">Run lint to check for problems</p>
          </div>
        ) : (
          <div className="space-y-2 p-6">
            {items.map((item, i) => {
              const Icon = LINT_ICONS[item.severity] ?? Info;
              const color = LINT_COLORS[item.severity] ?? "#86868b";
              const pageSlug = item.page.replace(/wiki\//, "").replace(/\.md$/, "");
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-[#e8e8ed] p-3 transition-colors hover:bg-[#fafafc]"
                >
                  <Icon size={14} style={{ color }} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {onPageSelect ? (
                        <button
                          className="text-[12px] font-medium text-[#0071e3] hover:underline"
                          onClick={() => onPageSelect(pageSlug)}
                        >
                          {item.page}
                        </button>
                      ) : (
                        <span className="text-[12px] font-medium text-[#1d1d1f]">{item.page}</span>
                      )}
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-medium text-white"
                        style={{ backgroundColor: color }}
                      >
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#86868b]">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
