import type { StreamdownTranslations } from "streamdown";

// 仅取 t 的字符串查表能力，避免 TFunction 泛型把调用点类型变复杂
type Translate = (key: string) => string;

/** streamdown 内置控件（复制/下载/缩放/外链确认等）的界面文案，键与 locales/*.json 的 streamdown 段一一对应 */
export function streamdownTranslations(t: Translate): Partial<StreamdownTranslations> {
  return {
    close: t("streamdown.close"),
    copied: t("streamdown.copied"),
    copyCode: t("streamdown.copyCode"),
    copyLink: t("streamdown.copyLink"),
    copyTable: t("streamdown.copyTable"),
    copyTableAsCsv: t("streamdown.copyTableAsCsv"),
    copyTableAsMarkdown: t("streamdown.copyTableAsMarkdown"),
    copyTableAsTsv: t("streamdown.copyTableAsTsv"),
    downloadDiagram: t("streamdown.downloadDiagram"),
    downloadDiagramAsMmd: t("streamdown.downloadDiagramAsMmd"),
    downloadDiagramAsPng: t("streamdown.downloadDiagramAsPng"),
    downloadDiagramAsSvg: t("streamdown.downloadDiagramAsSvg"),
    downloadFile: t("streamdown.downloadFile"),
    downloadImage: t("streamdown.downloadImage"),
    downloadTable: t("streamdown.downloadTable"),
    downloadTableAsCsv: t("streamdown.downloadTableAsCsv"),
    downloadTableAsMarkdown: t("streamdown.downloadTableAsMarkdown"),
    exitFullscreen: t("streamdown.exitFullscreen"),
    viewFullscreen: t("streamdown.viewFullscreen"),
    zoomIn: t("streamdown.zoomIn"),
    zoomOut: t("streamdown.zoomOut"),
    resetView: t("streamdown.resetView"),
    externalLinkWarning: t("streamdown.externalLinkWarning"),
    openExternalLink: t("streamdown.openExternalLink"),
    openLink: t("streamdown.openLink"),
    imageNotAvailable: t("streamdown.imageNotAvailable"),
    mermaidFormatMmd: t("streamdown.mermaidFormatMmd"),
    mermaidFormatPng: t("streamdown.mermaidFormatPng"),
    mermaidFormatSvg: t("streamdown.mermaidFormatSvg"),
    tableFormatCsv: t("streamdown.tableFormatCsv"),
    tableFormatMarkdown: t("streamdown.tableFormatMarkdown"),
    tableFormatTsv: t("streamdown.tableFormatTsv"),
  };
}
