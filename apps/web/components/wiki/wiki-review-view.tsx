"use client";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, RefreshCw, XCircle } from "lucide-react";
import type { ReviewItem } from "@feedmind/contracts";
import { listReviewItems, resolveReviewItem, dismissReviewItem, sweepReviewItems } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiReviewViewProps {
  spaceId: string;
}

const REVIEW_ICONS: Record<string, React.ElementType> = {
  "missing-page": Lightbulb,
  duplicate: AlertTriangle,
  contradiction: AlertTriangle,
  suggestion: Lightbulb,
};

const REVIEW_COLORS: Record<string, string> = {
  "missing-page": "#0071e3",
  duplicate: "#ff9500",
  contradiction: "#ff3b30",
  suggestion: "#34c759",
};

export function WikiReviewView({ spaceId }: WikiReviewViewProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listReviewItems(spaceId);
      setItems(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleResolve = async (itemId: string) => {
    try {
      await resolveReviewItem(spaceId, itemId);
      setItems((prev) => prev.map((r) => r.id === itemId ? { ...r, resolved: true } : r));
    } catch { /* handled by apiFetch toast */ }
  };

  const handleDismiss = async (itemId: string) => {
    try {
      await dismissReviewItem(spaceId, itemId);
      setItems((prev) => prev.filter((r) => r.id !== itemId));
    } catch { /* handled by apiFetch toast */ }
  };

  const handleSweep = async () => {
    setSweeping(true);
    try {
      const result = await sweepReviewItems(spaceId);
      if (result.swept > 0) await loadItems();
    } finally {
      setSweeping(false);
    }
  };

  const unresolved = items.filter((r) => !r.resolved);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-[#e8e8ed] px-6 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Review</h2>
          <p className="mt-0.5 text-[11px] text-[#86868b]">
            {unresolved.length} pending / {items.length} total
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSweep}
          disabled={sweeping}
          className="h-8 gap-1.5 rounded-lg px-3 text-[12px]"
        >
          <RefreshCw size={13} className={sweeping ? "animate-spin" : ""} />
          Sweep
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-4">
                <Skeleton className="mb-2 h-4 w-48" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-24 text-center">
            <CheckCircle2 size={32} className="mb-3 text-[#34c759]" />
            <p className="text-[13px] font-medium text-[#1d1d1f]">All clear</p>
            <p className="mt-1 text-[11px] text-[#86868b]">No review items pending</p>
          </div>
        ) : (
          <div className="space-y-3 p-6">
            {items.map((item) => {
              const Icon = REVIEW_ICONS[item.type] ?? Lightbulb;
              const color = REVIEW_COLORS[item.type] ?? "#86868b";
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    item.resolved ? "border-[#e8e8ed] bg-[#fafafc] opacity-60" : "border-[#e8e8ed] bg-white"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon size={14} style={{ color }} />
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
                      style={{ backgroundColor: color }}
                    >
                      {item.type}
                    </span>
                  </div>
                  <h3 className="mb-1 text-[13px] font-semibold text-[#1d1d1f]">{item.title}</h3>
                  <p className="mb-3 text-[11px] leading-relaxed text-[#86868b]">{item.description}</p>
                  {!item.resolved && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleResolve(item.id)}
                        className="h-7 rounded-lg px-2.5 text-[11px] text-[#34c759] hover:bg-[#f0faf0]"
                      >
                        <CheckCircle2 size={12} className="mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(item.id)}
                        className="h-7 rounded-lg px-2.5 text-[11px] text-[#86868b] hover:bg-[#f5f5f7]"
                      >
                        <XCircle size={12} className="mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
