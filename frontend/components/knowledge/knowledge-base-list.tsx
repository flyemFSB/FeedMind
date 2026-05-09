"use client";

import { useState } from "react";
import {
  Database,
  Globe,
  FileCode,
  MoreHorizontal,
  Plus,
  Link as LinkIcon,
} from "lucide-react";
import { KnowledgeBase } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface KnowledgeBaseListProps {
  knowledgeBases: KnowledgeBase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const tagIcons: Record<string, React.ElementType> = {
  LangChain: FileCode,
  Tutorial: FileCode,
  前端: Globe,
  设计: Globe,
  开源: FileCode,
  代码: FileCode,
};

export function KnowledgeBaseList({ knowledgeBases, selectedId, onSelect }: KnowledgeBaseListProps) {
  const [filter, setFilter] = useState("全部");
  const filters = ["全部", "团队", "个人", "网站", "代码库"];

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1">
        {filters.map((f) => (
          <Button
            key={f}
            onClick={() => setFilter(f)}
            variant={filter === f ? "default" : "ghost"}
            size="sm"
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              filter === f
                ? "bg-[#1d1d1f] text-white"
                : "text-[#6e6e73] hover:bg-[#f5f5f7]"
            }`}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* KB List */}
      <div className="space-y-2">
        {knowledgeBases.map((kb) => (
          <div
            key={kb.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(kb.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(kb.id);
              }
            }}
            className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
              selectedId === kb.id
                ? "bg-[#f5f5f7] border-2 border-[#0071e3]"
                : "bg-white border-2 border-transparent hover:bg-[#f5f5f7]"
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0071e3] to-[#2997ff] flex items-center justify-center shrink-0">
              <Database size={18} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-[14px] font-semibold text-[#1d1d1f] truncate">
                  {kb.name}
                </h4>
                {kb.id === "kb2" && (
                  <Badge className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                    同步正常
                  </Badge>
                )}
              </div>
              <p className="text-[12px] text-[#86868b] mt-0.5 truncate">{kb.description}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[11px] text-[#86868b]">
                  {kb.documentCount} 文档 · {kb.updatedAt}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {kb.tags.map((tag) => {
                const Icon = tagIcons[tag] || LinkIcon;
                return (
                  <span
                    key={tag}
                    className="w-6 h-6 rounded-md bg-[#f5f5f7] flex items-center justify-center"
                    title={tag}
                  >
                    <Icon size={12} className="text-[#86868b]" />
                  </span>
                );
              })}
              <Button
                type="button"
                aria-label={`${kb.name} 更多操作`}
                onClick={(event) => event.stopPropagation()}
                variant="ghost"
                size="icon-xs"
                className="ml-1 rounded-md hover:bg-[#f5f5f7]"
              >
                <MoreHorizontal size={14} className="text-[#86868b]" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add KB Button */}
      <Button variant="outline" className="w-full justify-center gap-2 rounded-xl border-2 border-dashed border-[#d2d2d7] py-3 text-[13px] text-[#86868b] hover:border-[#0071e3] hover:text-[#0071e3]">
        <Plus size={16} />
        <span>新建知识库</span>
      </Button>
    </div>
  );
}
