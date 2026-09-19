import type { HTMLAttributes } from "react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  Music2Icon,
  PaperclipIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";

export type AttachmentData =
  | (FileUIPart & { id?: string })
  | (SourceDocumentUIPart & { id?: string });

export type AttachmentMediaCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown";

const mediaCategoryIcons: Record<AttachmentMediaCategory, typeof ImageIcon> = {
  audio: Music2Icon,
  document: FileTextIcon,
  image: ImageIcon,
  source: GlobeIcon,
  unknown: PaperclipIcon,
  video: VideoIcon,
};

const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
  if (data.type === "source-document") {
    return "source";
  }

  const mediaType = data.mediaType?.toLowerCase() ?? "";
  const filename = data.filename?.toLowerCase() ?? "";

  if (
    mediaType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i.test(filename)
  ) {
    return "image";
  }
  if (mediaType.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(filename)) {
    return "video";
  }
  if (mediaType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(filename)) {
    return "audio";
  }
  if (
    mediaType.startsWith("application/") ||
    mediaType.startsWith("text/") ||
    /\.(pdf|docx?|txt|md|csv|xlsx?|json|tsx?|jsx?)$/i.test(filename)
  ) {
    return "document";
  }

  return "unknown";
};

const getAttachmentLabel = (data: AttachmentData): string => {
  if (data.type === "source-document") {
    return data.title || data.filename || "Source";
  }

  const category = getMediaCategory(data);
  return data.filename || (category === "image" ? "图片" : "附件");
};

export type AttachmentsProps = HTMLAttributes<HTMLDivElement>;

export const Attachments = ({ className, children, ...props }: AttachmentsProps) => (
  <div
    data-slot="attachments"
    className={cn("flex flex-wrap items-center gap-2", className)}
    {...props}
  >
    {children}
  </div>
);

export type AttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: (() => void) | undefined;
};

/**
 * 附件胶囊：缩略图 + 文件名 + 可选移除按钮。
 * 图片额外挂 hover 放大预览 —— 20px 缩略图看不清是唯一非自明的信息。
 */
export const Attachment = ({ data, onRemove, className, ...props }: AttachmentProps) => {
  const category = getMediaCategory(data);
  const label = getAttachmentLabel(data);
  const imageUrl = category === "image" && data.type === "file" ? data.url : undefined;
  const Icon = mediaCategoryIcons[category];

  const chip = (
    <div
      data-slot="attachment"
      className={cn(
        "group flex h-8 select-none items-center gap-1.5 rounded-md border border-editorial-hairline bg-editorial-surface-soft px-1.5 text-xs font-medium text-editorial-ink transition-colors hover:bg-editorial-surface-strong",
        className,
      )}
      {...props}
    >
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-editorial-surface-card">
        {imageUrl ? (
          <img alt={label} className="size-full object-cover" src={imageUrl} />
        ) : (
          <Icon className="size-3 text-editorial-ink-muted" />
        )}
      </span>
      <span className="block max-w-[140px] truncate">{label}</span>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          aria-label="移除"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="size-5 rounded p-0 opacity-0 transition-opacity group-hover:opacity-100 [&>svg]:size-2.5"
        >
          <XIcon />
        </Button>
      )}
    </div>
  );

  if (!imageUrl) return chip;

  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger delay={200} closeDelay={80} render={chip} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner className="isolate z-50" side="top" sideOffset={6}>
          <PreviewCard.Popup className="z-50 rounded-lg border border-editorial-hairline bg-editorial-surface-card p-2 text-editorial-ink shadow-island outline-none select-none">
            <div className="mb-1.5 font-medium text-xs">{label}</div>
            <img alt={label} className="max-h-80 max-w-80 object-contain" src={imageUrl} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
};
