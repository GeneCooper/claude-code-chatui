import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { BackupCommit } from '../../shared/types';

/**
 * Manages git-based backup checkpoints for workspace files.
 * Uses a separate git directory to avoid interfering with workspace .git.
 */
export class BackupService {
  private _backupDir: string;
  private _commits: BackupCommit[] = [];
  private _initialized = false;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._backupDir = path.join(_context.globalStorageUri.fsPath, 'backups');
  }

  get commits(): BackupCommit[] {
    return this._commits;
  }

  /**
   * Initialize the backup git repository.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    if (!fs.existsSync(this._backupDir)) {
      fs.mkdirSync(this._backupDir, { recursive: true });
    }

    const gitDir = path.join(this._backupDir, '.git');
    if (!fs.existsSync(gitDir)) {
      try {
        await this._exec(`git init --separate-git-dir "${gitDir}"`, workspaceFolder.uri.fsPath);
        // Configure to allow all files
        await this._exec(
          `git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}" config user.email "backup@claude-code-chatui"`,
        );
        await this._exec(
          `git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}" config user.name "Claude Code ChatUI Backup"`,
        );
      } catch (err) {
        console.error('Failed to initialize backup repo:', err);
        return;
      }
    }

    this._initialized = true;
  }

  /**
   * Create a backup checkpoint before Claude processes a message.
   */
  async createCheckpoint(userMessage: string): Promise<BackupCommit | null> {
    if (!this._initialized) await this.initialize();
    if (!this._initialized) return null;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const gitDir = path.join(this._backupDir, '.git');
    const workTree = workspaceFolder.uri.fsPath;
    const gitCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}"`;

    try {
      // Stage all files
      await this._exec(`${gitCmd} add -A`);

      // Determine commit message
      const truncated = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
      const isFirst = this._commits.length === 0;
      let commitMessage: string;

      // Check if there are changes
      const status = await this._exec(`${gitCmd} status --porcelain`);
      if (status.trim()) {
        commitMessage = isFirst ? `Initial backup: ${truncated}` : `Before: ${truncated}`;
      } else {
        commitMessage = `Checkpoint (no changes): ${truncated}`;
      }

      await this._exec(`${gitCmd} commit --allow-empty -m "${commitMessage.replace(/"/g, '\\"')}"`);

      // Get commit SHA
      const sha = (await this._exec(`${gitCmd} rev-parse HEAD`)).trim();

      const commit: BackupCommit = {
        id: `commit-${Date.now()}`,
        sha,
        message: commitMessage,
        timestamp: new Date().toISOString(),
      };

      this._commits.push(commit);
      return commit;
    } catch (err) {
      console.error('Failed to create backup checkpoint:', err);
      return null;
    }
  }

  /**
   * Restore workspace to a specific checkpoint.
   */
  async restoreToCommit(commitSha: string): Promise<boolean> {
    if (!this._initialized) return false;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return false;

    const gitDir = path.join(this._backupDir, '.git');
    const workTree = workspaceFolder.uri.fsPath;
    const gitCmd = `git --git-dir="${gitDir}" --work-tree="${workTree}"`;

    try {
      await this._exec(`${gitCmd} checkout ${commitSha} -- .`);
      return true;
    } catch (err) {
      console.error('Failed to restore backup:', err);
      return false;
    }
  }

  private _exec(command: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(
        command,
        {
          cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        },
        (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout);
        },
      );
    });
  }
}
