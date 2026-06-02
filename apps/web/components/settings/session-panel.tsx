"use client";

import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const TEMPLATES = ["研究分析", "知识问答", "代码助手", "报告生成"];

// 🚧 占位组件 — 当前版本为 UI 框架预览，所有控件的值为静态硬编码，
// 尚未连接到实际的状态管理。待会话模块接入后再绑定真实数据。
export function SessionPanel() {
  return (
    <div className="space-y-6">
      <h3 className="text-[15px] font-semibold text-[#1d1d1f]">当前会话模型配置</h3>

      <div>
        <label className="text-[12px] font-medium text-[#86868b] mb-2 block">预设模板</label>
        <div className="flex items-center gap-2">
          {TEMPLATES.map((t, idx) => (
            <Button
              key={t}
              variant={idx === 0 ? "default" : "secondary"}
              size="sm"
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                idx === 0
                  ? "bg-[#0071e3] text-white"
                  : "bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]"
              }`}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-[#86868b] mb-1.5 block">推理模型</label>
            <Select defaultValue="claude-3.7-sonnet">
              <SelectTrigger aria-label="选择推理模型" className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-[#d2d2d7]">
                <SelectGroup>
                  <SelectItem value="claude-3.7-sonnet">claude-3.7-sonnet</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] text-[#86868b] mb-1.5 block">温度</label>
              <div className="flex items-center gap-2">
                <Slider min={0} max={2} step={0.1} defaultValue={[0.2]} className="flex-1" />
                <span className="text-[12px] text-[#1d1d1f] w-8">0.2</span>
              </div>
            </div>
            <div>
              <label className="text-[12px] text-[#86868b] mb-1.5 block">Max Tokens</label>
              <Input type="text" defaultValue="8192" className="h-10 rounded-xl border-[#d2d2d7] text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] text-[#86868b] mb-1.5 block">上下文长度</label>
              <Select defaultValue="128k">
                <SelectTrigger aria-label="选择上下文长度" className="h-10 w-full rounded-xl border-[#d2d2d7] bg-white px-4 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-[#d2d2d7]">
                  <SelectGroup>
                    <SelectItem value="128k">128k</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <Switch defaultChecked />
              <span className="text-[13px] text-[#1d1d1f]">工具调用</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch defaultChecked />
              <span className="text-[13px] text-[#1d1d1f]">流式输出</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch />
              <span className="text-[13px] text-[#1d1d1f]">JSON 模式</span>
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[12px] text-[#86868b] mb-1.5 block">系统提示词模板</label>
        <Textarea
          defaultValue="你是 FeedMind AI 助手，专注于为用户提供准确、深入、结构化的分析与建议。请基于可用信息进行回答，必要时引用来源。"
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] text-[13px] text-[#1d1d1f] resize-none focus:outline-none focus:border-[#0071e3]"
        />
      </div>
    </div>
  );
}
