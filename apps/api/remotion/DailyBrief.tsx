import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import type { DailyReportScript } from "@feedmind/contracts";
import { createFallbackTimeline, type VideoTimeline } from "./layout";
import { theme } from "./theme";
import { Cover, ItemScene, Closing } from "./scenes";
import { CaptionBar } from "./captions";

export interface CaptionCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface DailyBriefProps {
  script: DailyReportScript;
  captions: CaptionCue[];
  timeline?: VideoTimeline;
}

export function DailyBrief({ script, captions, timeline: propTimeline }: DailyBriefProps) {
  const timeline = propTimeline ?? createFallbackTimeline(script);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      {/* 1. 开场场景与音频 */}
      <Sequence from={timeline.opening.fromFrame} durationInFrames={timeline.opening.frames}>
        <Cover date={script.date} hook={script.opening.hook} />
        {timeline.opening.audioFile && <Audio src={staticFile(timeline.opening.audioFile)} />}
      </Sequence>

      {/* 2. 正文各场景与对应音频（帧级对齐起播） */}
      {timeline.items.map((t, i) => (
        <Sequence key={i} from={t.fromFrame} durationInFrames={t.frames}>
          {script.items[i] && <ItemScene item={script.items[i]!} />}
          {t.audioFile && <Audio src={staticFile(t.audioFile)} />}
        </Sequence>
      ))}

      {/* 3. 收尾场景与音频 */}
      <Sequence from={timeline.closing.fromFrame} durationInFrames={timeline.closing.frames}>
        <Closing summary={script.closing.summary} />
        {timeline.closing.audioFile && <Audio src={staticFile(timeline.closing.audioFile)} />}
      </Sequence>

      {/* 4. 精准烧录字幕 */}
      <CaptionBar captions={captions} />
    </AbsoluteFill>
  );
}
