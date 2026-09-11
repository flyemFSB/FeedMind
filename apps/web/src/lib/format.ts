/** 秒数 → m:ss；无值返回 — */
export function formatDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 时间戳（epoch ms 或 ISO 文本）→ HH:mm:ss；withDate 时前缀 YYYY-MM-DD */
export function formatDateTime(ts: number | string, opts: { withDate?: boolean } = {}): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (!opts.withDate) return time;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}
