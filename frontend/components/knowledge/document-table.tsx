"use client";

import {
  FileText,
  MoreHorizontal,
  CheckCircle2,
  Loader2,
  CircleDot,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Document } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DocumentTableProps {
  documents: Document[];
  onSelect: (doc: Document) => void;
}

const statusConfig = {
  indexed: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50", label: "已索引" },
  indexing: { icon: Loader2, color: "text-[#0071e3]", bg: "bg-blue-50", label: "同步中" },
  pending: { icon: CircleDot, color: "text-[#86868b]", bg: "bg-gray-50", label: "待处理" },
  failed: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50", label: "失败" },
};

export function DocumentTable({ documents, onSelect }: DocumentTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[#1d1d1f]">文档列表 (132)</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-lg border-[#d2d2d7] text-[12px]">
            导入文档
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg border-[#d2d2d7] text-[12px]">
            添加网址
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg border-[#d2d2d7] text-[12px]">
            连接 GitHub
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg border-[#d2d2d7] text-[12px]">
            重新同步
          </Button>
        </div>
      </div>

      <div className="bg-white border border-[#d2d2d7] rounded-2xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#d2d2d7]">
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">文档名</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">来源</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">状态</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">分片数</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-wide text-[#86868b]">更新时间</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const status = statusConfig[doc.status];
              const StatusIcon = status.icon;
              return (
                <TableRow
                  key={doc.id}
                  onClick={() => onSelect(doc)}
                  className="border-b border-[#f5f5f7] last:border-0 hover:bg-[#f5f5f7] transition-colors cursor-pointer"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} className="text-[#86868b]" />
                      <span className="text-[13px] text-[#1d1d1f] font-medium">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[12px] text-[#86868b]">{doc.source}</TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge className={`gap-1.5 px-2 py-1 ${status.bg}`}>
                      <StatusIcon size={12} className={status.color} />
                      <span className={`text-[11px] font-medium ${status.color}`}>{status.label}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[12px] text-[#1d1d1f]">
                    {doc.chunkCount > 0 ? doc.chunkCount.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[12px] text-[#86868b]">{doc.updatedAt}</TableCell>
                  <TableCell className="px-2 py-3">
                    <Button variant="ghost" size="icon-xs" className="hover:bg-[#d2d2d7]/30">
                      <MoreHorizontal size={14} className="text-[#86868b]" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#d2d2d7]">
          <span className="text-[11px] text-[#86868b]">共 132 条</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" className="text-[#86868b] hover:bg-[#f5f5f7]">
              <ChevronLeft size={14} />
            </Button>
            <Button size="icon-sm" className="bg-[#0071e3] text-[12px] text-white">
              1
            </Button>
            <Button variant="ghost" size="icon-sm" className="text-[12px] text-[#1d1d1f] hover:bg-[#f5f5f7]">
              2
            </Button>
            <span className="text-[#86868b] px-1">...</span>
            <Button variant="ghost" size="icon-sm" className="text-[12px] text-[#1d1d1f] hover:bg-[#f5f5f7]">
              22
            </Button>
            <Button variant="ghost" size="icon-xs" className="text-[#86868b] hover:bg-[#f5f5f7]">
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
