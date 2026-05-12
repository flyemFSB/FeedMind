"use client";

export type PreviewPayload = {
  title?: string;
  url?: string;
  content?: string;
  source?: string;
};

const previewOpenEvent = "feedmind:preview-open";

export function openPreview(payload: PreviewPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PreviewPayload>(previewOpenEvent, { detail: payload }));
}

export function onPreviewOpen(listener: (payload: PreviewPayload) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handlePreviewOpen = (event: Event) => {
    if (event instanceof CustomEvent) listener(event.detail as PreviewPayload);
  };

  window.addEventListener(previewOpenEvent, handlePreviewOpen);
  return () => window.removeEventListener(previewOpenEvent, handlePreviewOpen);
}
