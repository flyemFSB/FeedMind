"use client";

import { Database, FileText, Layers, Clock } from "lucide-react";

interface StatCardsProps {
  kbCount: number;
  docCount: number;
  chunkCount: string;
  lastUpdate: string;
}

export function StatCards({ kbCount, docCount, chunkCount, lastUpdate }: StatCardsProps) {
  const stats = [
    {
      label: "知识库",
      value: kbCount,
      unit: "个知识库",
      icon: Database,
      color: "from-[#0071e3] to-[#2997ff]",
    },
    {
      label: "文档",
      value: docCount,
      unit: "个文档",
      icon: FileText,
      color: "from-[#34c759] to-[#30d158]",
    },
    {
      label: "向量片段",
      value: chunkCount,
      unit: "个片段",
      icon: Layers,
      color: "from-[#ff9500] to-[#ff9f0a]",
    },
    {
      label: "最近更新",
      value: lastUpdate,
      unit: "上次同步时间",
      icon: Clock,
      color: "from-[#af52de] to-[#bf5af2]",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white border border-[#d2d2d7] rounded-2xl p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-[12px] text-[#86868b] font-medium">{stat.label}</span>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
              <stat.icon size={16} className="text-white" strokeWidth={2} />
            </div>
          </div>
          <div className="text-[28px] font-semibold text-[#1d1d1f] tracking-[-0.5px]">
            {stat.value}
          </div>
          <div className="text-[11px] text-[#86868b] mt-0.5">{stat.unit}</div>
        </div>
      ))}
    </div>
  );
}
