"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "./milkdown-theme.css";

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export interface MilkdownEditorHandle {
  /** 同步获取编辑器最新 Markdown（绕过 listener 防抖） */
  getMarkdown: () => string;
}

interface MilkdownEditorProps {
  /** 初始 Markdown 内容 */
  defaultValue: string;
  /** 内容变更回调，返回最新 Markdown 字符串 */
  onChange?: (markdown: string) => void;
  /** 占位提示文本 */
  placeholder?: string;
}

/**
 * MilkdownEditor — 基于 Crepe 的 WYSIWYG Markdown 编辑器
 * 使用命令式 API：在 useEffect 中创建/销毁实例，避免 React 重渲染干扰编辑器状态。
 * 通过 ref 暴露 getMarkdown() 供保存时同步取值，支持可选防抖以减少回调频率。
 */
export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(
  function MilkdownEditor({ defaultValue, onChange, placeholder }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const crepeRef = useRef<Crepe | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
    }));

    useEffect(() => {
      const root = containerRef.current;
      if (!root) return;

      const crepe = new Crepe({
        root,
        defaultValue,
        features: {
          // Wiki 编辑不需要图片上传和 AI 功能
          [CrepeFeature.ImageBlock]: false,
          [CrepeFeature.AI]: false,
        },
        featureConfigs: {
          [CrepeFeature.Placeholder]: {
            text: placeholder ?? "开始编写 Markdown 内容…",
          },
        },
      });

      // 监听内容变更，通过 ref 回调避免闭包过期（带防抖）
      const debouncedUpdate = debounce((markdown: string) => {
        onChangeRef.current?.(markdown);
      }, 300); // 300ms 防抖

      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          debouncedUpdate(markdown);
        });
      });

      crepeRef.current = crepe;
      void crepe.create().catch((err) => {
        console.error("[MilkdownEditor] 编辑器初始化失败:", err);
      });

      return () => {
        void crepe.destroy();
        crepeRef.current = null;
      };
      // 仅在挂载时创建一次编辑器，defaultValue 变更由父组件控制重新挂载
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div ref={containerRef} className="milkdown h-full overflow-y-auto" />;
  },
);
