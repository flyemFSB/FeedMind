"use client";

import { X, FileText, Globe, CheckCircle2, Search, Clock } from "lucide-react";
import { Document } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DocumentDetailPanelProps {
  document: Document | null;
  onClose: () => void;
}

export function DocumentDetailPanel({ document, onClose }: DocumentDetailPanelProps) {
  if (!document) return null;

  return (
    <div className="w-[360px] min-w-[360px] border-l border-[#d2d2d7] bg-white h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#d2d2d7]">
        <span className="text-[14px] font-semibold text-[#1d1d1f]">文档详情</span>
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon-sm"
          className="rounded-lg hover:bg-[#f5f5f7]"
        >
          <X size={16} className="text-[#86868b]" />
        </Button>
      </div>

      <div className="p-5 space-y-6">
        {/* Title */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f5f5f7] flex items-center justify-center shrink-0">
            <FileText size={20} className="text-[#0071e3]" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#1d1d1f]">{document.title}</h3>
            <p className="text-[12px] text-[#86868b] mt-0.5">{document.source}</p>
          </div>
        </div>

        {/* Meta Info */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#86868b] flex items-center gap-1.5">
              <Globe size={14} />
              来源
            </span>
            <span className="text-[#0066cc]">{document.source}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#86868b] flex items-center gap-1.5">
              <Search size={14} />
              分片数
            </span>
            <span className="text-[#1d1d1f]">{document.chunkCount}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#86868b] flex items-center gap-1.5">
              <Clock size={14} />
              更新时间
            </span>
            <span className="text-[#1d1d1f]">{document.updatedAt}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#86868b] flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              状态
            </span>
            <Badge className="bg-[#f5f5f7] px-2 py-0.5 text-[11px] font-medium text-[#6e6e73]">
              {document.status}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
