/**
 * 格式化为本地时间字符串：YYYY-MM-DD HH:mm:ss
 * 示例：2026-03-22 01:30:00
 */
export function formatLocalTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化为带时区偏移的本地时间
 * 示例：2026-03-22 01:30:00 +08:00
 */
export function formatLocalTimeWithOffset(date: Date): string {
  const local = formatLocalTime(date);
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${local} ${sign}${hours}:${minutes}`;
}
