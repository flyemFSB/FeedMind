"use client";

import { useState } from "react";
import {
  X,
  Eye,
  LayoutGrid,
  BarChart3,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const slideNavItems = [
  { id: "01", label: "概览", icon: LayoutGrid },
  { id: "02", label: "趋势一", icon: BarChart3 },
  { id: "03", label: "趋势二", icon: BarChart3 },
  { id: "04", label: "趋势三", icon: BarChart3 },
  { id: "05", label: "开源项目", icon: Code2 },
];

export function PreviewPanel() {
  const [activeSlide, setActiveSlide] = useState("01");
  const [expanded, setExpanded] = useState(true);

  if (!expanded) {
    return (
      <Button
        onClick={() => setExpanded(true)}
        variant="ghost"
        className="h-full w-full rounded-none hover:bg-[#f5f5f7]"
      >
        <Eye size={20} className="text-[#86868b]" />
      </Button>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#d2d2d7]">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[#1d1d1f]">输出预览</span>
          <Eye size={14} className="text-[#86868b]" />
        </div>
        <Button
          onClick={() => setExpanded(false)}
          variant="ghost"
          size="icon-sm"
          className="rounded-lg hover:bg-[#f5f5f7]"
        >
          <X size={16} className="text-[#86868b]" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="bg-[#f5f5f7] rounded-2xl p-5 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#2997ff] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3 className="text-[17px] font-semibold text-[#1d1d1f] mb-1">
            暂无输出预览
          </h3>
          <p className="text-[12px] text-[#86868b] mb-4">完成一次分析后将在这里显示结果。</p>
          <Button className="rounded-full bg-[#0071e3] px-5 text-[13px] font-medium text-white hover:bg-[#0066cc]">
            立即查看
          </Button>
        </div>

        <div>
          <div className="flex items-center gap-3 overflow-x-auto pb-3">
            {slideNavItems.map((item) => (
              <Button
                key={item.id}
                onClick={() => setActiveSlide(item.id)}
                variant="ghost"
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl min-w-[64px] transition-colors ${
                  activeSlide === item.id
                    ? "bg-[#f5f5f7] text-[#1d1d1f]"
                    : "text-[#86868b] hover:bg-[#f5f5f7]/50"
                }`}
              >
                <item.icon size={18} strokeWidth={1.5} />
                <span className="text-[10px] font-medium whitespace-nowrap">{item.id} {item.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
