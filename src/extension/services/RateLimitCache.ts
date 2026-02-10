import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CachedRateLimits {
  session5h: number;
  weekly7d: number;
  reset5h?: number;
  reset7d?: number;
  timestamp: number;
}

const CACHE_FILE_PATH = path.join(os.homedir(), '.claude', 'rate-limit-cache.json');

export function readRateLimitCache(): CachedRateLimits | null {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) return null;

    const content = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
    const data = JSON.parse(content) as CachedRateLimits;

    if (
      typeof data.session5h !== 'number' ||
      typeof data.weekly7d !== 'number' ||
      typeof data.timestamp !== 'number'
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function writeRateLimitCache(data: Omit<CachedRateLimits, 'timestamp'>): void {
  try {
    const claudeDir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const cacheData: CachedRateLimits = { ...data, timestamp: Date.now() };
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch {
    // Silently fail
  }
}

export function getCacheAgeMinutes(cache: CachedRateLimits): number {
  return Math.round((Date.now() - cache.timestamp) / (60 * 1000));
}
