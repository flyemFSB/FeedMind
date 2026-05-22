"use client";

import { CheckCircle2, Clock, FileText, Network, Search } from "lucide-react";
import { WikiPage } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface WikiPageDetailPanelProps {
  page: WikiPage | null;
  onClose: () => void;
}

export function WikiPageDetailPanel({ page, onClose }: WikiPageDetailPanelProps) {
  const rows = [
    { label: "来源", value: page?.source ?? "", icon: FileText },
    { label: "片段", value: page?.chunkCount.toLocaleString() ?? "0", icon: Search },
    { label: "关系", value: page?.relationCount.toLocaleString() ?? "0", icon: Network },
    { label: "更新时间", value: page?.updatedAt ?? "", icon: Clock },
  ];

  return (
    <Dialog open={!!page} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>页面详情</DialogTitle>
          <DialogDescription>查看这个 WIKI 页面在来源、片段和关系图谱中的状态。</DialogDescription>
        </DialogHeader>

        {page && (
          <div className="flex flex-col gap-5">
            <Separator />
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                <FileText className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{page.title}</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{page.source}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <row.icon className="size-4" />
                    {row.label}
                  </span>
                  <span className="truncate">{row.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  状态
                </span>
                <Badge variant="secondary">{page.status}</Badge>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
