"use client";

import { Clock, FileText, Layers, Network } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WikiStatsProps {
  wikiCount: number;
  pageCount: number;
  relationCount: number;
  lastUpdate: string;
}

export function WikiStats({ wikiCount, pageCount, relationCount, lastUpdate }: WikiStatsProps) {
  const stats = [
    { label: "WIKI", value: wikiCount, unit: "个空间", icon: Layers },
    { label: "页面", value: pageCount, unit: "已整理页面", icon: FileText },
    { label: "关系", value: relationCount, unit: "图谱连接", icon: Network },
    { label: "最近更新", value: lastUpdate, unit: "同步时间", icon: Clock },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
      {stats.map((stat) => (
        <Card key={stat.label} size="sm">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-[12px] text-muted-foreground">{stat.label}</CardTitle>
            <stat.icon className="size-4 text-primary" strokeWidth={1.8} />
          </CardHeader>
          <CardContent>
            <div className="text-[26px] font-semibold tracking-[-0.3px]">
              {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
            </div>
            <div className="text-[11px] text-muted-foreground">{stat.unit}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
