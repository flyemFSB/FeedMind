/** 解析上下文/输出上限为 token 数。DB 存的是 K tokens（64 → 64000）；字符串兼容 "128"/"64K"/"1M" */
export function parseTokenCount(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.round(value * 1000);
  }
  const upper = value.toUpperCase().trim();
  const match = upper.match(/^([\d.]+)\s*(K|M)?$/);
  if (!match) return undefined;
  const num = parseFloat(match[1] ?? "");
  if (Number.isNaN(num)) return undefined;
  const unit = match[2];
  if (unit === "M") return Math.round(num * 1_000_000);
  if (unit === "K") return Math.round(num * 1_000);
  // 无单位后缀视为 KB（K tokens）
  return Math.round(num * 1_000);
}
