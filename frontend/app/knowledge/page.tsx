"use client";

import { useState } from "react";
import { Search, Filter, ArrowUpDown, Plus } from "lucide-react";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";
import { StatCards } from "@/components/knowledge/stat-cards";
import { KnowledgeBaseList } from "@/components/knowledge/knowledge-base-list";
import { DocumentTable } from "@/components/knowledge/document-table";
import { DocumentDetailPanel } from "@/components/knowledge/document-detail-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Document } from "@/lib/types";

export default function KnowledgePage() {
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  return (
    <LayoutWrapper title="知识库" subtitle="统一管理文档、网页、代码与结构化知识">
      <div className="flex h-full">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[24px] font-semibold text-[#1d1d1f] tracking-[-0.2px]">知识库</h1>
                <p className="text-[13px] text-[#86868b] mt-0.5">统一管理文档、网页、代码与结构化知识</p>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <Input
                  type="text"
                  placeholder="搜索知识库、文档或标签..."
                  className="h-10 rounded-xl border-[#d2d2d7] pl-9 pr-4 text-[13px] text-[#1d1d1f]"
                />
              </div>
              <Button variant="outline" className="rounded-xl border-[#d2d2d7] px-4 text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7]">
                <Filter size={14} />
                <span>筛选</span>
              </Button>
              <Button variant="outline" className="rounded-xl border-[#d2d2d7] px-4 text-[13px] text-[#1d1d1f] hover:bg-[#f5f5f7]">
                <ArrowUpDown size={14} />
                <span>最近更新</span>
              </Button>
              <Button className="rounded-xl bg-[#0071e3] px-4 text-[13px] font-medium text-white hover:bg-[#0066cc]">
                <Plus size={14} />
                <span>新建知识库</span>
              </Button>
            </div>

            {/* Stats */}
            <StatCards
              kbCount={0}
              docCount={0}
              chunkCount="0"
              lastUpdate="暂无"
            />

            {/* Content Area */}
            <div className="flex gap-6">
              {/* Left: KB List */}
              <div className="w-[320px] shrink-0">
                <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-3">我的知识库</h2>
                <KnowledgeBaseList
                  knowledgeBases={[]}
                  selectedId={selectedKb}
                  onSelect={setSelectedKb}
                />
              </div>

              {/* Right: Documents */}
              <div className="flex-1 min-w-0">
                <DocumentTable
                  documents={[]}
                  onSelect={setSelectedDoc}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <DocumentDetailPanel
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      </div>
    </LayoutWrapper>
  );
}
