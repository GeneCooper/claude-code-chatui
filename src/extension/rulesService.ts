import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { RULES_DIR } from '../shared/constants';

export interface RuleViolation {
  id: string;
  ruleName: string;
  description: string;
  severity: 'warning' | 'error';
  filePath: string;
  suggestion?: string;
}

export interface ArchitectureRule {
  name: string;
  filePath: string;
  content: string;
}

const DEFAULT_RULES = `# Naming Conventions
- Use PascalCase for class names and type names
- Use camelCase for variable and function names
- Use UPPER_SNAKE_CASE for constants
- Prefix private class members with underscore

# File Organization
- One exported class/component per file
- Keep files under 400 lines
- Group imports: external, then internal, then relative

# Error Handling
- Never swallow errors silently (empty catch blocks)
- Always provide meaningful error messages
- Use typed errors where possible
`;

export class RulesService implements vscode.Disposable {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  private _getRulesDir(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    return path.join(workspaceFolder.uri.fsPath, RULES_DIR);
  }

  async getRules(): Promise<ArchitectureRule[]> {
    const rulesDir = this._getRulesDir();
    if (!rulesDir || !fs.existsSync(rulesDir)) return [];

    const rules: ArchitectureRule[] = [];
    try {
      const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(rulesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        rules.push({
          name: file.replace('.md', ''),
          filePath: `${RULES_DIR}/${file}`,
          content,
        });
      }
    } catch { /* ignore read errors */ }
    return rules;
  }

  async createDefaultRules(): Promise<void> {
    const rulesDir = this._getRulesDir();
    if (!rulesDir) return;
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

    const defaultPath = path.join(rulesDir, 'coding-standards.md');
    if (!fs.existsSync(defaultPath)) {
      fs.writeFileSync(defaultPath, DEFAULT_RULES, 'utf8');
    }
  }

  async openRulesFile(relativePath: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    const uri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch { /* file not found */ }
  }

  async getSystemPromptContent(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('rules.enabled', true)) return null;
    if (!config.get<boolean>('rules.injectInSystemPrompt', true)) return null;

    const rules = await this.getRules();
    if (rules.length === 0) return null;

    const rulesText = rules.map((r) => r.content).join('\n\n---\n\n');
    return `[Architecture Rules - Follow these conventions]\n${rulesText}`;
  }

  async checkEdit(options: {
    filePath: string;
    fileContentBefore: string;
    fileContentAfter: string;
  }): Promise<RuleViolation[]> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('rules.enabled', true)) return [];

    const rules = await this.getRules();
    if (rules.length === 0) return [];

    const rulesText = rules.map((r) => `### ${r.name}\n${r.content}`).join('\n\n');
    const diff = this._buildSimpleDiff(options.fileContentBefore, options.fileContentAfter);
    if (!diff) return [];

    const checkPrompt = `Given these project rules and this code change, identify any rule violations. Be strict but reasonable.

RULES:
${rulesText}

FILE: ${options.filePath}
CHANGES:
${diff.substring(0, 3000)}

Respond in JSON array format ONLY: [{"ruleName": "...", "description": "...", "severity": "warning"|"error", "suggestion": "..."}]
If no violations, respond exactly: []`;

    return new Promise((resolve) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

      const proc = cp.spawn('claude', ['-p', checkPrompt, '--output-format', 'text', '--model', 'claude-haiku-4-5-20251001'], {
        cwd,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.on('close', () => {
        try {
          const jsonMatch = stdout.match(/\[[\s\S]*\]/);
          if (!jsonMatch) { resolve([]); return; }
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            ruleName: string; description: string; severity: string; suggestion?: string;
          }>;
          const violations: RuleViolation[] = parsed.map((v, i) => ({
            id: `violation-${Date.now()}-${i}`,
            ruleName: v.ruleName,
            description: v.description,
            severity: (v.severity === 'error' ? 'error' : 'warning') as 'warning' | 'error',
            filePath: options.filePath,
            suggestion: v.suggestion,
          }));
          resolve(violations);
        } catch {
          resolve([]);
        }
      });
      proc.on('error', () => resolve([]));
      setTimeout(() => { try { if (!proc.killed) proc.kill('SIGTERM'); } catch { /* already dead */ } }, 30000);
    });
  }

  private _buildSimpleDiff(before: string, after: string): string | null {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const diffs: string[] = [];
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < maxLines && diffs.length < 100; i++) {
      if (beforeLines[i] !== afterLines[i]) {
        if (i < beforeLines.length && beforeLines[i] !== undefined) diffs.push(`- ${beforeLines[i]}`);
        if (i < afterLines.length && afterLines[i] !== undefined) diffs.push(`+ ${afterLines[i]}`);
      }
    }
    return diffs.length > 0 ? diffs.join('\n') : null;
  }

  dispose(): void {}
}
