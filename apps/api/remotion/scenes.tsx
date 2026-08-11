import type { CSSProperties } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DailyReportScript } from "@feedmind/contracts";
import { fontStack, theme } from "./theme";

const center: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function Cover({ date, hook }: { date: string; hook: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, fps * 0.6], [0.96, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        ...center,
        backgroundColor: theme.bg,
        flexDirection: "column",
        gap: 24,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div style={{ fontSize: 40, color: theme.accent, fontWeight: 700, fontFamily: fontStack }}>
        今日日报 · {date}
      </div>
      <div
        style={{
          fontSize: 76,
          color: theme.ink,
          fontWeight: 700,
          fontFamily: fontStack,
          textAlign: "center",
          maxWidth: "82%",
          lineHeight: 1.3,
        }}
      >
        {hook}
      </div>
    </AbsoluteFill>
  );
}

export function TitleWalk({ title }: { title: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const y = interpolate(frame, [0, fps * 0.6], [80, 0], {
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: fontStack,
        fontSize: 64,
        fontWeight: 700,
        color: theme.ink,
        transform: `translateY(${y}px)`,
        opacity,
        textAlign: "center",
        maxWidth: "88%",
        lineHeight: 1.3,
      }}
    >
      {title}
    </div>
  );
}

export function PointsStagger({ points }: { points: string[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: "80%" }}>
      {points.map((point, i) => {
        const start = i * fps * 0.7;
        const opacity = interpolate(frame, [start, start + fps * 0.3], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const x = interpolate(frame, [start, start + fps * 0.4], [-30, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        });
        return (
          <div
            key={i}
            style={{
              fontFamily: fontStack,
              fontSize: 44,
              color: theme.ink,
              opacity,
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: theme.accent,
                flexShrink: 0,
              }}
            />
            {point}
          </div>
        );
      })}
    </div>
  );
}

export function QuoteHighlight({ quote }: { quote: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        fontFamily: fontStack,
        backgroundColor: theme.accentSoft,
        color: theme.ink,
        fontSize: 46,
        fontWeight: 600,
        padding: "24px 40px",
        borderRadius: 16,
        borderLeft: `6px solid ${theme.accent}`,
        opacity,
        maxWidth: "84%",
        lineHeight: 1.4,
      }}
    >
      “{quote}”
    </div>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 40,
        bottom: 40,
        fontFamily: fontStack,
        fontSize: 24,
        color: theme.inkMuted,
        backgroundColor: theme.bg,
        border: `1px solid ${theme.hairline}`,
        borderRadius: 8,
        padding: "8px 16px",
      }}
    >
      来源：{source}
    </div>
  );
}

// 单条场景：标题 + 可选引用高亮 + 要点，全部在场内交错淡入（无需子 Sequence）
export function ItemScene({ item }: { item: DailyReportScript["items"][number] }) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        padding: 96,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
      }}
    >
      <TitleWalk title={item.title} />
      {item.quote ? <QuoteHighlight quote={item.quote} /> : null}
      {item.points.length > 0 ? <PointsStagger points={item.points} /> : null}
      <SourceBadge source={item.source} />
    </AbsoluteFill>
  );
}

export function Closing({ summary }: { summary: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ ...center, backgroundColor: theme.bg, opacity }}>
      <div
        style={{
          fontFamily: fontStack,
          fontSize: 56,
          fontWeight: 700,
          color: theme.ink,
          textAlign: "center",
          maxWidth: "80%",
          lineHeight: 1.4,
        }}
      >
        {summary}
      </div>
    </AbsoluteFill>
  );
}
