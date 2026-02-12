import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ContextCollector } from './contextCollector';

export interface NextEditSuggestion {
  id: string;
  filePath: string;
  reason: string;
  changedSymbols: string[];
  severity: 'info' | 'warning';
}

export class NextEditAnalyzer implements vscode.Disposable {
  constructor(private readonly _contextCollector: ContextCollector) {}

  async analyzeEdit(options: {
    filePath: string;
    fileContentBefore: string;
    fileContentAfter: string;
    workspaceRoot: string;
  }): Promise<NextEditSuggestion[]> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('nextEdit.enabled', true)) return [];

    const { filePath, fileContentBefore, fileContentAfter, workspaceRoot } = options;
    const suggestions: NextEditSuggestion[] = [];

    // 1. Find changed/removed exported symbols
    const beforeExports = this._contextCollector.extractExportedSymbols(fileContentBefore);
    const afterExports = this._contextCollector.extractExportedSymbols(fileContentAfter);

    const removedSymbols = beforeExports.filter((s) => !afterExports.includes(s));
    const changedSymbols: string[] = [];

    for (const sym of afterExports) {
      if (this._symbolChanged(sym, fileContentBefore, fileContentAfter)) {
        changedSymbols.push(sym);
      }
    }

    if (changedSymbols.length === 0 && removedSymbols.length === 0) return [];

    // 2. Find files that import this file
    const importers = await this._contextCollector.findImporters(filePath, workspaceRoot);

    // 3. Check which importers use the changed symbols
    for (const importerPath of importers) {
      const absPath = path.join(workspaceRoot, importerPath);
      if (!fs.existsSync(absPath)) continue;

      let importerContent: string;
      try {
        importerContent = fs.readFileSync(absPath, 'utf8');
      } catch { continue; }

      const usedChanged = changedSymbols.filter((sym) => importerContent.includes(sym));
      const usedRemoved = removedSymbols.filter((sym) => importerContent.includes(sym));

      if (usedChanged.length > 0 || usedRemoved.length > 0) {
        const allAffected = [...usedRemoved, ...usedChanged];
        suggestions.push({
          id: `next-edit-${Date.now()}-${importerPath}`,
          filePath: importerPath,
          reason: usedRemoved.length > 0
            ? `Uses removed symbol(s): ${usedRemoved.join(', ')}`
            : `Imports modified symbol(s): ${usedChanged.join(', ')}`,
          changedSymbols: allAffected,
          severity: usedRemoved.length > 0 ? 'warning' : 'info',
        });
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  private _symbolChanged(symbol: string, before: string, after: string): boolean {
    // Find lines containing the symbol definition in both versions
    const symbolRegex = new RegExp(`(?:export|const|let|var|function|class|interface|type|enum)\s+${symbol}\b[^]*?(?=\n(?:export|const|let|var|function|class|interface|type|enum)\s|$)`, 'm');
    const beforeMatch = before.match(symbolRegex);
    const afterMatch = after.match(symbolRegex);
    if (!beforeMatch && afterMatch) return true; // New symbol
    if (beforeMatch && !afterMatch) return true; // Removed
    if (!beforeMatch || !afterMatch) return false;
    return beforeMatch[0] !== afterMatch[0]; // Content changed
  }

  dispose(): void {}
}
