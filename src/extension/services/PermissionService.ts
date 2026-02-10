import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Stored permission entry
 */
export interface PermissionEntry {
  toolName: string;
  pattern: string;
  createdAt: string;
}

/**
 * Permissions data structure
 */
export interface Permissions {
  allowedPatterns: PermissionEntry[];
}

/**
 * Manages tool permission storage and pattern matching.
 * Provides a self-contained permission store for pre-approving tool executions.
 */
export class PermissionService implements vscode.Disposable {
  private _permissionsPath: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    const permDir = path.join(_context.globalStorageUri.fsPath, 'permissions');
    if (!fs.existsSync(permDir)) {
      fs.mkdirSync(permDir, { recursive: true });
    }
    this._permissionsPath = path.join(permDir, 'permissions.json');
  }

  dispose(): void {
    // No-op
  }

  /**
   * Get all stored permissions.
   */
  async getPermissions(): Promise<Permissions> {
    try {
      if (fs.existsSync(this._permissionsPath)) {
        const raw = fs.readFileSync(this._permissionsPath, 'utf8');
        return JSON.parse(raw) as Permissions;
      }
    } catch {
      // Corrupt file — return empty
    }
    return { allowedPatterns: [] };
  }

  /**
   * Check if a tool execution is pre-approved by a stored pattern.
   */
  async isToolPreApproved(toolName: string, input: Record<string, unknown>): Promise<boolean> {
    const permissions = await this.getPermissions();

    for (const entry of permissions.allowedPatterns) {
      if (entry.toolName !== toolName) continue;

      const command = this._extractCommand(toolName, input);
      if (command && this._matchesPattern(command, entry.pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Save a new permission pattern.
   */
  async savePermission(toolName: string, pattern: string): Promise<void> {
    const permissions = await this.getPermissions();

    // Avoid duplicates
    const exists = permissions.allowedPatterns.some(
      (e) => e.toolName === toolName && e.pattern === pattern,
    );
    if (exists) return;

    permissions.allowedPatterns.push({
      toolName,
      pattern,
      createdAt: new Date().toISOString(),
    });

    await this._savePermissions(permissions);
  }

  /**
   * Remove a permission by tool name and pattern.
   */
  async removePermission(toolName: string, pattern: string): Promise<void> {
    const permissions = await this.getPermissions();
    permissions.allowedPatterns = permissions.allowedPatterns.filter(
      (e) => !(e.toolName === toolName && e.pattern === pattern),
    );
    await this._savePermissions(permissions);
  }

  /**
   * Add a permission pattern (alias for savePermission).
   */
  async addPermission(toolName: string, pattern: string): Promise<void> {
    await this.savePermission(toolName, pattern);
  }

  /**
   * Clear all permissions.
   */
  async clearPermissions(): Promise<void> {
    await this._savePermissions({ allowedPatterns: [] });
  }

  // ==================== Private ====================

  /**
   * Extract a command string from tool input for pattern matching.
   */
  private _extractCommand(toolName: string, input: Record<string, unknown>): string | null {
    switch (toolName) {
      case 'Bash':
        return (input.command as string) || null;
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'MultiEdit':
        return (input.file_path as string) || null;
      case 'Glob':
        return (input.pattern as string) || null;
      case 'Grep':
        return (input.pattern as string) || null;
      default:
        return null;
    }
  }

  /**
   * Check if a command matches a stored pattern.
   * Supports glob-like patterns with * wildcards.
   */
  private _matchesPattern(command: string, pattern: string): boolean {
    // Exact match
    if (command === pattern) return true;

    // Wildcard match: convert glob-like pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      return new RegExp(`^${escaped}$`).test(command);
    } catch {
      return false;
    }
  }

  /**
   * Write permissions to disk.
   */
  private async _savePermissions(permissions: Permissions): Promise<void> {
    try {
      fs.writeFileSync(this._permissionsPath, JSON.stringify(permissions, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save permissions:', err);
    }
  }
}
