/**
 * Formatting Utilities
 *
 * Human-readable formatting for tokens, costs, durations, file sizes, and timestamps.
 *
 * @module webview/utils/format
 */

/**
 * Format a token count for display.
 * 1234 → "1.2K", 1234567 → "1.2M"
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a compact token display.
 * Shorter form: "1.2K" with no decimal for small values.
 */
export function formatTokensCompact(count: number): string {
  if (count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}K`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a USD cost for display.
 * 0 → "$0.00", 0.0001 → "$0.0001", 1.5 → "$1.50"
 */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Format a duration in milliseconds for display.
 * 500 → "500ms", 1234 → "1.2s", 61000 → "1m 1s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a running timer from start time.
 * Returns "0s", "5s", "1m 30s" etc.
 */
export function formatTimer(startTimeMs: number): string {
  const elapsed = Date.now() - startTimeMs;
  return formatDuration(elapsed);
}

/**
 * Format a byte count for display.
 * 1024 → "1 KB", 1048576 → "1 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * Format a timestamp for display.
 * Returns time string like "2:30 PM" or "14:30" based on locale.
 */
export function formatTimestamp(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Format a relative time string.
 * Returns "just now", "5 min ago", "2 hours ago", "yesterday", etc.
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Date.now() - d.getTime();

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`;
  if (diff < 172_800_000) return 'yesterday';
  return d.toLocaleDateString();
}

/**
 * Format a number with commas.
 * 1234567 → "1,234,567"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a percentage.
 * 0.123 → "12.3%", 1.0 → "100%"
 */
export function formatPercentage(ratio: number, decimals: number = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/**
 * Format a compact number.
 * 1234 → "1.2K", 1234567 → "1.2M"
 */
export function formatCompact(n: number): string {
  if (Math.abs(n) < 1000) return n.toString();
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (Math.abs(n) < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/**
 * Get filename from a path.
 */
export function getFilename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/**
 * Get file extension from a path.
 */
export function getFileExtension(path: string): string {
  const name = getFilename(path);
  const dotIdx = name.lastIndexOf('.');
  return dotIdx >= 0 ? name.substring(dotIdx + 1) : '';
}

/**
 * Truncate a string in the middle with ellipsis.
 * "very/long/path/to/file.ts" → "very/long/...file.ts"
 */
export function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return `${str.substring(0, half)}...${str.substring(str.length - half)}`;
}
