"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  FileText,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Upload,
} from "lucide-react";
import { WikiPage } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface WikiPageTableProps {
  pages: WikiPage[];
  onSelect: (page: WikiPage) => void;
}

const statusConfig = {
  indexed: { icon: CheckCircle2, label: "已入 WIKI", variant: "secondary" as const },
  indexing: { icon: Loader2, label: "同步中", variant: "default" as const },
  pending: { icon: CircleDot, label: "待整理", variant: "outline" as const },
  failed: { icon: AlertCircle, label: "失败", variant: "destructive" as const },
};

export function WikiPageTable({ pages, onSelect }: WikiPageTableProps) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>WIKI 页面</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Upload data-icon="inline-start" />
            导入来源
          </Button>
          <Button variant="outline" size="sm">
            <RotateCw data-icon="inline-start" />
            重新同步
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                页面
              </TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                来源
              </TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                状态
              </TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                片段
              </TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                关系
              </TableHead>
              <TableHead className="px-4 text-[11px] uppercase tracking-wide text-muted-foreground">
                更新
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => {
              const status = statusConfig[page.status];
              const StatusIcon = status.icon;
              return (
                <TableRow
                  key={page.id}
                  onClick={() => onSelect(page)}
                  className="cursor-pointer"
                >
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2.5">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="font-medium">{page.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">{page.source}</TableCell>
                  <TableCell className="px-4">
                    <Badge variant={status.variant}>
                      <StatusIcon className="size-3" />
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4">
                    {page.chunkCount > 0 ? page.chunkCount.toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="px-4">
                    {page.relationCount > 0 ? page.relationCount.toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground">{page.updatedAt}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-xs" aria-label={`${page.title} 更多操作`}>
                      <MoreHorizontal />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
