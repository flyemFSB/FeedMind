import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import type { DailyReportScript } from "@feedmind/contracts";
import { OPENING_FRAMES, CLOSING_FRAMES, itemFrames } from "./layout";
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
}

export function DailyBrief({ script, captions }: DailyBriefProps) {
  let cursor = OPENING_FRAMES;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      <Sequence from={0} durationInFrames={OPENING_FRAMES}>
        <Cover date={script.date} hook={script.opening.hook} />
      </Sequence>

      {script.items.map((item, i) => {
        const frames = itemFrames(item.narration);
        const seq = (
          <Sequence key={i} from={cursor} durationInFrames={frames}>
            <ItemScene item={item} />
          </Sequence>
        );
        cursor += frames;
        return seq;
      })}

      <Sequence from={cursor} durationInFrames={CLOSING_FRAMES}>
        <Closing summary={script.closing.summary} />
      </Sequence>

      {/* 旁白与烧录字幕全程铺底；narration.mp3 由渲染服务预置到 bundle publicDir */}
      <Audio src={staticFile("narration.mp3")} />
      <CaptionBar captions={captions} />
    </AbsoluteFill>
  );
}
