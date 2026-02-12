import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Import parsing patterns
// ============================================================================

const JS_IMPORT_PATTERNS = [
  /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const PY_IMPORT_PATTERNS = [
  /from\s+([\w.]+)\s+import/g,
  /^import\s+([\w.]+)/gm,
];

// Export patterns for next-edit analysis
export const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
  /module\.exports\s*(?:\.(\w+))?\s*=/g,
];

interface ImportCacheEntry {
  imports: string[];
  mtime: number;
}

export interface AutoContextInfo {
  importedFiles: string[];
  recentFiles: string[];
  activeFile: string | null;
  totalFiles: number;
  enabled: boolean;
}

// ============================================================================
// ContextCollector Service
// ============================================================================

export class ContextCollector implements vscode.Disposable {
  private _recentFiles: { path: string; timestamp: number }[] = [];
  private _maxRecentFiles = 5;
  private _disposables: vscode.Disposable[] = [];
  private _importCache = new Map<string, ImportCacheEntry>();

  constructor() {
    this._disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== 'file') return;
        if (e.contentChanges.length === 0) return;
        const relativePath = vscode.workspace.asRelativePath(e.document.uri, false);
        this._trackRecentFile(relativePath);
      }),
    );
  }
  private _trackRecentFile(relativePath: string): void {
    this._recentFiles = this._recentFiles.filter((f) => f.path !== relativePath);
    this._recentFiles.unshift({ path: relativePath, timestamp: Date.now() });
    if (this._recentFiles.length > this._maxRecentFiles) {
      this._recentFiles = this._recentFiles.slice(0, this._maxRecentFiles);
    }
  }

  get recentFiles(): string[] {
    return this._recentFiles.map((f) => f.path);
  }

  // ==================== Import Parsing ====================

  parseImports(content: string, fileExt: string): string[] {
    const imports: string[] = [];
    const patterns = ['.py'].includes(fileExt) ? PY_IMPORT_PATTERNS : JS_IMPORT_PATTERNS;

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];
        if (!importPath) continue;
        // Skip node_modules / external packages
        if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.startsWith('@/')) continue;
        imports.push(importPath);
      }
    }

    return [...new Set(imports)];
  }

  private _resolveImportPath(importPath: string, sourceFile: string, workspaceRoot: string): string | null {
    const sourceDir = path.dirname(path.join(workspaceRoot, sourceFile));
    let resolved = path.resolve(sourceDir, importPath);

    // Normalize to forward slashes for consistency
    resolved = resolved.replace(/\\/g, '/');
    const root = workspaceRoot.replace(/\\/g, '/');

    // Try exact path first, then with extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (fs.existsSync(candidate)) {
        // Return workspace-relative path
        const rel = path.relative(root, candidate).replace(/\\/g, '/');
        return rel;
      }
    }
    return null;
  }
  async getImportedFiles(filePath: string, workspaceRoot: string, depth = 2): Promise<string[]> {
    const visited = new Set<string>();
    const result: string[] = [];

    const collect = (currentPath: string, currentDepth: number) => {
      if (currentDepth <= 0 || visited.has(currentPath)) return;
      visited.add(currentPath);

      const absPath = path.join(workspaceRoot, currentPath);
      if (!fs.existsSync(absPath)) return;

      // Check cache
      let stat: fs.Stats;
      try { stat = fs.statSync(absPath); } catch { return; }
      const cached = this._importCache.get(currentPath);
      let imports: string[];

      if (cached && cached.mtime === stat.mtimeMs) {
        imports = cached.imports;
      } else {
        try {
          const content = fs.readFileSync(absPath, 'utf8');
          const ext = path.extname(currentPath);
          const rawImports = this.parseImports(content, ext);
          imports = rawImports
            .map((imp) => this._resolveImportPath(imp, currentPath, workspaceRoot))
            .filter((p): p is string => p !== null);
          this._importCache.set(currentPath, { imports, mtime: stat.mtimeMs });
        } catch {
          return;
        }
      }

      for (const imp of imports) {
        if (!visited.has(imp)) {
          result.push(imp);
          collect(imp, currentDepth - 1);
        }
      }
    };

    collect(filePath, depth);
    return result;
  }
  // ==================== Reverse Import Lookup ====================

  async findImporters(targetFile: string, workspaceRoot: string): Promise<string[]> {
    const importers: string[] = [];
    const normalizedTarget = targetFile.replace(/\\/g, '/');
    // Strip extension for matching
    const targetNoExt = normalizedTarget.replace(/\.(ts|tsx|js|jsx|mts|mjs)$/, '');

    try {
      const uris = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,mts,mjs}',
        '**/node_modules/**,**/.git/**,**/dist/**,**/build/**',
        2000,
      );

      for (const uri of uris) {
        const filePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
        if (filePath === normalizedTarget) continue;

        try {
          const content = fs.readFileSync(uri.fsPath, 'utf8');
          const ext = path.extname(filePath);
          const rawImports = this.parseImports(content, ext);
          for (const imp of rawImports) {
            const resolved = this._resolveImportPath(imp, filePath, workspaceRoot);
            if (resolved) {
              const resolvedNoExt = resolved.replace(/\.(ts|tsx|js|jsx|mts|mjs)$/, '');
              if (resolvedNoExt === targetNoExt || resolved === normalizedTarget) {
                importers.push(filePath);
                break;
              }
            }
          }
        } catch { /* skip unreadable files */ }
      }
    } catch { /* workspace search failed */ }

    return importers;
  }
  // ==================== Extract Exported Symbols ====================

  extractExportedSymbols(content: string): string[] {
    const symbols: string[] = [];
    for (const pattern of EXPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const captured = match[1];
        if (!captured) continue;
        // Handle export { A, B, C } — split by comma
        if (captured.includes(',')) {
          for (const sym of captured.split(',')) {
            const name = sym.trim().split(/\s+as\s+/).pop()?.trim();
            if (name) symbols.push(name);
          }
        } else {
          symbols.push(captured.trim());
        }
      }
    }
    return [...new Set(symbols)];
  }
  // ==================== Context Block Builder ====================

  async buildContextBlock(options: {
    activeFile: string | null;
    editorSelection: { filePath: string; text: string } | null;
    workspaceRoot: string;
    maxFiles: number;
    includeImports: boolean;
    includeRecentFiles: boolean;
  }): Promise<{ contextBlock: string; info: AutoContextInfo }> {
    const { activeFile, workspaceRoot, maxFiles, includeImports, includeRecentFiles } = options;
    const files = new Set<string>();
    const importedFiles: string[] = [];

    // 1. Add imported files from active file
    if (includeImports && activeFile) {
      const imports = await this.getImportedFiles(activeFile, workspaceRoot, 2);
      for (const imp of imports) {
        if (files.size >= maxFiles) break;
        files.add(imp);
        importedFiles.push(imp);
      }
    }

    // 2. Add recent files
    const recentFiles: string[] = [];
    if (includeRecentFiles) {
      for (const recent of this._recentFiles) {
        if (files.size >= maxFiles) break;
        if (recent.path !== activeFile && !files.has(recent.path)) {
          files.add(recent.path);
          recentFiles.push(recent.path);
        }
      }
    }

    const info: AutoContextInfo = {
      importedFiles,
      recentFiles,
      activeFile,
      totalFiles: files.size,
      enabled: true,
    };

    if (files.size === 0) {
      return { contextBlock: '', info: { ...info, totalFiles: 0 } };
    }

    const lines: string[] = ['[Auto Context]'];
    if (activeFile) lines.push(`Active file: ${activeFile}`);
    if (recentFiles.length > 0) lines.push(`Recent files: ${recentFiles.join(', ')}`);
    if (importedFiles.length > 0) lines.push(`Related files (via imports): ${importedFiles.join(', ')}`);

    return { contextBlock: lines.join('\n'), info };
  }

  dispose(): void {
    while (this._disposables.length) this._disposables.pop()?.dispose();
    this._importCache.clear();
  }
}
