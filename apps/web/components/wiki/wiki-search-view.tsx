"use client";
import { useCallback, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import type { WikiSearchResult } from "@feedmind/contracts";
import { searchWiki } from "@/lib/api/wiki";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WikiSearchViewProps {
  spaceId: string;
  onPageSelect: (pageId: string) => void;
}

export function WikiSearchView({ spaceId, onPageSelect }: WikiSearchViewProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await searchWiki(spaceId, query.trim());
      setResults(data.results);
      setSearched(true);
    } catch {
      // handled by apiFetch toast
    } finally {
      setLoading(false);
    }
  }, [spaceId, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-[#e8e8ed] px-6 py-4">
        <h2 className="text-[15px] font-semibold text-[#1d1d1f] mb-3">Wiki 搜索</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <Input
              className="h-9 w-full rounded-lg border-[#e8e8ed] pl-9 text-[13px]"
              placeholder="搜索页面..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="h-9 rounded-lg bg-[#0071e3] text-white text-[12px] px-4">
            {loading ? <Loader2 size={14} className="animate-spin" /> : "搜索"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search size={24} className="text-[#d2d2d7] mb-3" />
            <p className="text-[13px] text-[#86868b]">未找到 "{query}" 的相关结果</p>
            <p className="text-[11px] text-[#d2d2d7] mt-1">尝试其他关键词</p>
          </div>
        )}
        {results.length > 0 && (
          <div className="divide-y divide-[#f0f0f2]">
            {results.map((result, i) => (
              <button
                key={i}
                className="w-full px-6 py-3 text-left transition-colors hover:bg-[#fafafc]"
                onClick={() => onPageSelect(result.path.replace(/^wiki\//, "").replace(/\.md$/, ""))}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-medium text-[#1d1d1f]">{result.title}</span>
                  {result.titleMatch && <span className="text-[10px] text-[#0071e3] bg-[#e8f0fe] rounded px-1.5 py-0.5">标题匹配</span>}
                </div>
                <p className="text-[11px] text-[#86868b] leading-relaxed">{result.snippet}</p>
                <p className="text-[10px] text-[#d2d2d7] mt-0.5">{result.path} · 评分：{result.score.toFixed(1)}</p>
              </button>
            ))}
          </div>
        )}
        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search size={32} className="text-[#d2d2d7] mb-3" />
            <p className="text-[13px] text-[#86868b]">搜索所有 Wiki 页面</p>
          </div>
        )}
      </div>
    </div>
  );
}
