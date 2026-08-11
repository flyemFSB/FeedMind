import type { FC } from "react";
import { Composition } from "remotion";
import type { DailyReportScript } from "@feedmind/contracts";
import { DailyBrief, type DailyBriefProps } from "./DailyBrief";
import { totalFrames, FPS } from "./layout";

const emptyScript: DailyReportScript = {
  date: "",
  opening: { hook: "" },
  items: [],
  closing: { summary: "" },
};

export const RemotionRoot: FC = () => (
  <Composition
    id="DailyBrief"
    component={DailyBrief}
    durationInFrames={totalFrames(emptyScript)}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ script: emptyScript, captions: [] } satisfies DailyBriefProps}
    calculateMetadata={({ props }: { props: DailyBriefProps }) => ({
      durationInFrames: totalFrames(props.script),
    })}
  />
);
