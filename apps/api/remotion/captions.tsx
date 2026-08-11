import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fontStack } from "./theme";
import type { CaptionCue } from "./DailyBrief";

// 底部烧录字幕：按当前帧时间取激活的字幕块，在其自身时长内淡入淡出
export function CaptionBar({ captions }: { captions: CaptionCue[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = captions.find((c) => t >= c.startSec && t < c.endSec);
  const opacity = active
    ? interpolate(
        frame,
        [
          active.startSec * fps,
          active.startSec * fps + fps * 0.15,
          active.endSec * fps - fps * 0.15,
          active.endSec * fps,
        ],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      )
    : 0;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 110,
        pointerEvents: "none",
      }}
    >
      {active && (
        <div
          style={{
            fontFamily: fontStack,
            fontSize: 40,
            color: "#0f172a",
            backgroundColor: "rgba(255,255,255,0.92)",
            padding: "12px 28px",
            borderRadius: 12,
            maxWidth: "80%",
            textAlign: "center",
            opacity,
          }}
        >
          {active.text}
        </div>
      )}
    </AbsoluteFill>
  );
}
