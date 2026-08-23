import type { FC } from "react";
import { Composition } from "remotion";
import type { DailyReportScript } from "@feedmind/contracts";
import { DailyBrief, type DailyBriefProps } from "./DailyBrief";
import { createFallbackTimeline, FPS } from "./layout";

const emptyScript: DailyReportScript = {
  date: "",
  opening: { hook: "" },
  items: [],
  closing: { summary: "" },
};

const defaultTimeline = createFallbackTimeline(emptyScript);

export const RemotionRoot: FC = () => (
  <Composition
    id="DailyBrief"
    component={DailyBrief}
    durationInFrames={defaultTimeline.totalFrames}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={
      { script: emptyScript, captions: [], timeline: defaultTimeline } satisfies DailyBriefProps
    }
    calculateMetadata={({ props }: { props: DailyBriefProps }) => ({
      durationInFrames:
        props.timeline?.totalFrames ?? createFallbackTimeline(props.script).totalFrames,
    })}
  />
);
