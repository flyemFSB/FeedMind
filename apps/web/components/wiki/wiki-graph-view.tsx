"use client";
import { useCallback, useEffect, useState } from "react";
import { Search, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WikiGraphViewProps {
  spaceId: string;
  onPageSelect: (pageId: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  concept: "#0071e3",
  entity: "#34c759",
  source: "#ff9500",
  query: "#ff3b30",
  comparison: "#5856d6",
  synthesis: "#af52de",
};

export function WikiGraphView({ spaceId, onPageSelect }: WikiGraphViewProps) {
  return (
    <div className="flex h-full flex-1 flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[#e8e8ed] px-6 py-3">
        <span className="text-[15px] font-semibold text-[#1d1d1f]">🕸️ 知识图谱</span>
        <div className="flex-1" />
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <Input
            className="h-8 w-[180px] rounded-lg border-[#e8e8ed] pl-8 text-[12px]"
            placeholder="搜索节点..."
          />
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-3 text-[11px] text-[#86868b] hover:bg-[#f5f5f7]">
          <RotateCcw size={13} />
          重置
        </Button>
      </div>

      {/* Graph area */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 items-center justify-center bg-[#fafafc]">
          <div className="text-center">
            <div className="mb-4 text-5xl">🕸️</div>
            <p className="text-[15px] font-medium text-[#1d1d1f]">知识图谱</p>
            <p className="mt-1 text-[12px] text-[#86868b]">
              图谱功能将在后续版本中启用<br />
              需要导入数据并运行 Ingest 后生成
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <span
                  key={type}
                  className="rounded-full px-2.5 py-1 text-[10px] font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
