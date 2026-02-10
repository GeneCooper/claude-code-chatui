import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import type { UsageData } from '../../shared/types';
import {
  readRateLimitCache,
  writeRateLimitCache,
  getCacheAgeMinutes,
  type CachedRateLimits,
} from './RateLimitCache';

const POLLING_INTERVAL_MS = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 60_000;

interface RateLimitData {
  session5h: number;
  weekly7d: number;
  reset5h?: number;
  reset7d?: number;
}

export class UsageService implements vscode.Disposable {
  private _usageData: UsageData | undefined;
  private _pollInterval: NodeJS.Timeout | undefined;
  private _dataEmitter = new EventEmitter();
  private _fetchInFlight: Promise<void> | null = null;
  private _currentProcess: ChildProcess | null = null;
  private _isDisposed = false;

  constructor(private readonly _outputChannel?: vscode.OutputChannel) {
    this._log('UsageService initializing');
    this._loadFromCache();
    this._startPolling();
  }

  private _log(message: string): void {
    if (this._outputChannel) {
      this._outputChannel.appendLine(`[UsageService] ${message}`);
    }
  }

  private _loadFromCache(): void {
    const cache = readRateLimitCache();
    if (!cache) return;

    const ageMinutes = getCacheAgeMinutes(cache);
    this._log(`Cache found (${ageMinutes} minutes old)`);

    this._usageData = this._buildUsageDataFromCache(cache);
    this._dataEmitter.emit('update', this._usageData);
  }

  private _buildUsageDataFromCache(cache: CachedRateLimits): UsageData {
    return this._buildUsageDataFromRateLimits({
      session5h: cache.session5h,
      weekly7d: cache.weekly7d,
      reset5h: cache.reset5h,
      reset7d: cache.reset7d,
    });
  }

  // Event subscriptions
  onUsageUpdate(callback: (data: UsageData) => void): vscode.Disposable {
    this._dataEmitter.on('update', callback);
    return { dispose: () => { this._dataEmitter.off('update', callback); } };
  }

  onError(callback: (error: string) => void): vscode.Disposable {
    this._dataEmitter.on('error', callback);
    return { dispose: () => { this._dataEmitter.off('error', callback); } };
  }

  private _startPolling(): void {
    if (this._isDisposed) return;
    this._stopPolling();

    this._pollInterval = setInterval(() => {
      if (!this._isDisposed) void this.fetchUsageData();
    }, POLLING_INTERVAL_MS);

    // Initial fetch
    void this.fetchUsageData();
  }

  private _stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = undefined;
    }
  }

  async fetchUsageData(): Promise<void> {
    if (this._isDisposed) return;

    if (this._fetchInFlight) {
      await this._fetchInFlight;
      return;
    }

    this._fetchInFlight = this._doFetch();
    try {
      await this._fetchInFlight;
    } finally {
      this._fetchInFlight = null;
    }
  }

  onClaudeSessionEnd(): void {
    setTimeout(() => {
      if (!this._isDisposed) void this.fetchUsageData();
    }, 1000);
  }

  private async _doFetch(): Promise<void> {
    if (this._isDisposed) return;

    try {
      const usageData = await this._fetchFromClaudeCommand();
      if (usageData) {
        this._usageData = usageData;
        this._dataEmitter.emit('update', this._usageData);
      } else {
        const cache = readRateLimitCache();
        if (cache) {
          const cachedData = this._buildUsageDataFromCache(cache);
          this._usageData = cachedData;
          this._dataEmitter.emit('update', cachedData);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this._log(`Failed to fetch: ${errorMsg}`);
      this._dataEmitter.emit('error', 'Error getting usage');
    }
  }

  private async _fetchFromClaudeCommand(): Promise<UsageData | null> {
    if (this._isDisposed) return null;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (this._currentProcess) {
          this._currentProcess.stdout?.removeAllListeners();
          this._currentProcess.stderr?.removeAllListeners();
          this._currentProcess.removeAllListeners();
          this._currentProcess = null;
        }
      };

      const safeResolve = (value: UsageData | null) => {
        if (!resolved) { resolved = true; cleanup(); resolve(value); }
      };

      timeoutId = setTimeout(() => {
        this._log('Command timed out after 60s');
        if (this._currentProcess && !this._currentProcess.killed) {
          this._currentProcess.kill('SIGTERM');
        }
        safeResolve(null);
      }, COMMAND_TIMEOUT_MS);

      try {
        const args = ['-p', '.', '--output-format', 'json', '--model', 'claude-haiku-4-5-20251001'];

        this._currentProcess = spawn('claude', args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
          env: { ...process.env, ANTHROPIC_LOG: 'debug' },
        });

        this._currentProcess.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        this._currentProcess.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

        this._currentProcess.on('close', () => {
          const combined = stdout + '\n' + stderr;
          const rateLimits = this._parseRateLimitHeaders(combined);

          if (rateLimits) {
            this._saveToCache(rateLimits);
            safeResolve(this._buildUsageDataFromRateLimits(rateLimits));
          } else {
            safeResolve(null);
          }
        });

        this._currentProcess.on('error', () => { safeResolve(null); });
      } catch {
        safeResolve(null);
      }
    });
  }

  private _parseRateLimitHeaders(output: string): RateLimitData | null {
    let session5h: number | undefined;
    let weekly7d: number | undefined;
    let reset5h: number | undefined;
    let reset7d: number | undefined;

    if (!output.includes('ratelimit') && !output.includes('utilization')) return null;

    const match5h = output.match(
      /["']?anthropic-ratelimit-unified-5h-utilization["']?\s*[":]\s*["']?([0-9.]+)/i,
    );
    if (match5h) {
      const value = parseFloat(match5h[1]);
      if (!isNaN(value) && value >= 0 && value <= 2) session5h = Math.min(1, value);
    }

    const match7d = output.match(
      /["']?anthropic-ratelimit-unified-7d-utilization["']?\s*[":]\s*["']?([0-9.]+)/i,
    );
    if (match7d) {
      const value = parseFloat(match7d[1]);
      if (!isNaN(value) && value >= 0 && value <= 2) weekly7d = Math.min(1, value);
    }

    const matchReset5h = output.match(
      /["']?anthropic-ratelimit-unified-5h-reset["']?\s*[":]\s*["']?([0-9]+)/i,
    );
    if (matchReset5h) reset5h = parseInt(matchReset5h[1], 10);

    const matchReset7d = output.match(
      /["']?anthropic-ratelimit-unified-7d-reset["']?\s*[":]\s*["']?([0-9]+)/i,
    );
    if (matchReset7d) reset7d = parseInt(matchReset7d[1], 10);

    if (session5h === undefined && weekly7d === undefined) return null;

    return { session5h: session5h ?? 0, weekly7d: weekly7d ?? 0, reset5h, reset7d };
  }

  private _buildUsageDataFromRateLimits(rateLimits: RateLimitData): UsageData {
    return {
      currentSession: {
        usageCost: rateLimits.session5h,
        costLimit: 1,
        resetsIn: rateLimits.reset5h ? this._formatResetTime(rateLimits.reset5h) : '~5 hr',
      },
      weekly: {
        costLikely: rateLimits.weekly7d,
        costLimit: 1,
        resetsAt: rateLimits.reset7d ? this._formatResetTime(rateLimits.reset7d) : '~7 days',
      },
    };
  }

  private _formatResetTime(timestamp: number): string {
    const resetDate = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) return 'Now';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const parts: string[] = [];
    if (diffHours > 0) parts.push(`${diffHours} hr`);
    if (diffMinutes > 0 || parts.length === 0) parts.push(`${diffMinutes} min`);

    const timeStr = resetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    if (diffHours >= 24) {
      const dateStr = resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr} at ${timeStr}`;
    }

    return `${parts.join(' ')} @ ${timeStr}`;
  }

  private _saveToCache(rateLimits: RateLimitData): void {
    writeRateLimitCache({
      session5h: rateLimits.session5h,
      weekly7d: rateLimits.weekly7d,
      reset5h: rateLimits.reset5h,
      reset7d: rateLimits.reset7d,
    });
  }

  get currentUsage(): UsageData | undefined { return this._usageData; }

  dispose(): void {
    this._isDisposed = true;
    this._stopPolling();
    this._dataEmitter.removeAllListeners();

    if (this._currentProcess) {
      if (!this._currentProcess.killed) this._currentProcess.kill('SIGTERM');
      this._currentProcess.stdout?.removeAllListeners();
      this._currentProcess.stderr?.removeAllListeners();
      this._currentProcess.removeAllListeners();
      this._currentProcess = null;
    }
  }
}
