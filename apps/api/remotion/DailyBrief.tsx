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

const resolveSegmentAudioSrc = (seg: { audioDataUrl?: string; audioFile?: string }) => {
  const src = seg.audioDataUrl || seg.audioFile;
  return !src || src.startsWith("data:") || src.startsWith("http") ? src : staticFile(src);
};

export function DailyBrief({ script, captions, timeline: propTimeline }: DailyBriefProps) {
  const timeline = propTimeline ?? createFallbackTimeline(script);

  const openingAudio = resolveSegmentAudioSrc(timeline.opening);
  const closingAudio = resolveSegmentAudioSrc(timeline.closing);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      {/* 1. 开场场景与音频 */}
      <Sequence from={timeline.opening.fromFrame} durationInFrames={timeline.opening.frames}>
        <Cover date={script.date} hook={script.opening.hook} />
        {openingAudio && <Audio src={openingAudio} />}
      </Sequence>

      {/* 2. 正文各场景与对应音频（帧级对齐起播） */}
      {timeline.items.map((t, i) => {
        const itemAudio = resolveSegmentAudioSrc(t);
        return (
          <Sequence key={i} from={t.fromFrame} durationInFrames={t.frames}>
            {script.items[i] && <ItemScene item={script.items[i]!} />}
            {itemAudio && <Audio src={itemAudio} />}
          </Sequence>
        );
      })}

      {/* 3. 收尾场景与音频 */}
      <Sequence from={timeline.closing.fromFrame} durationInFrames={timeline.closing.frames}>
        <Closing summary={script.closing.summary} />
        {closingAudio && <Audio src={closingAudio} />}
      </Sequence>

      {/* 4. 精准烧录字幕 */}
      <CaptionBar captions={captions} />
    </AbsoluteFill>
  );
}
