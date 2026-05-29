import Link from "next/link";
import { LayoutWrapper } from "@/components/app-shell/layout-wrapper";

export default function MyWikiPage() {
  return (
    <LayoutWrapper title="我的 WIKI" subtitle="后续版本单独迁移">
      <section className="flex h-full min-h-[360px] items-center justify-center px-6">
        <div className="max-w-[420px] text-center">
          <h2 className="text-[18px] font-semibold text-[#1d1d1f]">WIKI 暂未迁移</h2>
          <p className="mt-2 text-[13px] leading-6 text-[#6e6e73]">
            {/* Wiki 按迁移计划延后，避免当前阶段误调未迁移 API。 */}
            当前 TypeScript 迁移阶段只开放 Agent 与业务后端能力，WIKI 将在后续版本单独接入。
          </p>
          <Link
            href="/chat"
            className="mt-5 inline-flex h-9 items-center justify-center rounded-lg bg-[#0071e3] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#0066cc]"
          >
            返回会话
          </Link>
        </div>
      </section>
    </LayoutWrapper>
  );
}
