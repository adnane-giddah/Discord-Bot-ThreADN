export function renderProgressBar(
  done: number,
  total: number,
  width = 20,
): string {
  const ratio = total === 0 ? 1 : Math.min(1, done / total);
  const filled = Math.round(ratio * width);
  const bar = "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
  const pct = Math.round(ratio * 100);
  return `${bar} ${pct}%`;
}
