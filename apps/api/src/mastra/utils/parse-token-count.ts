/** 解析 "128" (KB) → 128000, "1M" → 1000000, "64K" → 64000 */
export function parseTokenCount(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase().trim();
  const match = upper.match(/^([\d.]+)\s*(K|M)?$/);
  if (!match) return undefined;
  const num = parseFloat(match[1] ?? "");
  if (Number.isNaN(num)) return undefined;
  const unit = match[2];
  if (unit === "M") return Math.round(num * 1_000_000);
  if (unit === "K") return Math.round(num * 1_000);
  // 无单位后缀视为 KB
  return Math.round(num * 1_000);
}
