import type { FC } from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { DailyBrief, type DailyBriefProps } from "./DailyBrief";
import { createFallbackTimeline, FPS } from "./layout";

// defaultProps 不放 timeline 也不放 captions：
// - timeline 在 calculateMetadata 中按 props 重新计算（runtime 一定会有）
// - captions 在渲染时经 inputProps 传入（来自 tts 实测 cues），不进 defaultProps（避免 defaultProps 过大）
// - 详见 https://www.remotion.dev/docs/troubleshooting/defaultprops-too-big
const emptyProps: DailyBriefProps = {
  script: { date: "", opening: { hook: "" }, items: [], closing: { summary: "" } },
  captions: [],
};

/**
 * 顶层 FontGuard：挂上 delayRender，等 document.fonts.ready 再 continueRender。
 * 系统 CJK 字体栈依赖运行环境（Windows/macOS/Linux）任一安装有 YaHei/PingFang/Noto，
 * document.fonts.ready 保证首帧渲染前字体已就绪，避免抓取帧时回落到 sans-serif 出现豆腐。
 * 为什么不引 @remotion/fonts：依赖系统字体能减少 10MB+ 字体包与首加载超时；依赖运行时已装字体。
 */
const FontGuard: FC = () => {
  if (typeof document !== "undefined" && "fonts" in document) {
    const handle = delayRender();
    void document.fonts.ready.then(() => continueRender(handle));
  }
  return null;
};

export const RemotionRoot: FC = () => (
  <>
    <FontGuard />
    <Composition
      id="DailyBrief"
      component={DailyBrief}
      durationInFrames={createFallbackTimeline(emptyProps.script).totalFrames}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={emptyProps}
      calculateMetadata={({ props }: { props: DailyBriefProps }) => ({
        durationInFrames:
          props.timeline?.totalFrames ?? createFallbackTimeline(props.script).totalFrames,
      })}
    />
  </>
);
