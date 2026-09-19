import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

interface UseDragWidthOptions {
  /** localStorage 持久化键；宽度按像素存字符串 */
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  /** 手柄所在的边：left = 面板在右侧、向左拖变宽；right = 面板在左侧、向右拖变宽 */
  handleSide: "left" | "right";
}

/**
 * 拖拽调整面板宽度。
 * 起拖时锁定起始宽度：手势进行中 state 变化会重建 handler，但本次手势的基准不受影响。
 */
export function useDragWidth({
  storageKey,
  defaultWidth,
  min,
  max,
  handleSide,
}: UseDragWidthOptions) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) return Math.min(Math.max(saved, min), max);
    } catch {
      // localStorage 不可用时退回默认宽度
    }
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // 持久化失败不影响本次会话内的宽度
    }
  }, [storageKey, width]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      setIsResizing(true);
      const startX = event.clientX;
      const startWidth = width;
      const sign = handleSide === "left" ? -1 : 1;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const next = startWidth + sign * (moveEvent.clientX - startX);
        setWidth(Math.min(Math.max(next, min), max));
      };

      const stop = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", stop);
        document.removeEventListener("pointercancel", stop);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stop);
      document.addEventListener("pointercancel", stop);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, min, max, handleSide],
  );

  const resetWidth = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  return { width, isResizing, handleResizePointerDown, resetWidth };
}
