import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

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

export const EXPORT_PATTERNS = [
  /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
  /module\.exports\s*(?:\.(\w+))?\s*=/g,
];

// ============================================================================
// Message analysis patterns
// ============================================================================

const FILE_NAME_PATTERN = /\b([\w-]+\.(ts|tsx|js|jsx|py|vue|go|rs|java|rb|css|scss|json|md|yaml|yml|toml))\b/g;
const PATH_PATTERN = /\b((?:src|lib|app|test|spec|tests|extension|webview|shared|components|hooks|utils|services)\/[\w\-/.]+(?:\.\w+)?)\b/g;
const SYMBOL_PATTERN = /\b([A-Z][a-zA-Z0-9]+(?:Service|Provider|Manager|Controller|Handler|Store|Hook|Component|Module|Util|Helper|Factory|Builder|Collector|Processor|Emitter)?)\b/g;
const FUNCTION_PATTERN = /\b((?:handle|get|set|create|update|delete|fetch|parse|build|init|use|on|emit|send|load|save|process|render|dispatch|validate)[A-Z]\w+)\b/g;

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
  gitChangedFiles: string[];
  messageMentionedFiles: string[];
  totalContentChars: number;
}

// ============================================================================
// ContextCollector Service
// ============================================================================

const MAX_TOTAL_CONTENT_CHARS = 50000; // ~12K tokens total cap
const MAX_FILE_CONTENT_CHARS = 5000;   // Per-file cap

export class ContextCollector implements vscode.Disposable {
  private _recentFiles: { path: string; timestamp: number }[] = [];
  private _maxRecentFiles = 10;
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
        if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.startsWith('@/')) continue;
        imports.push(importPath);
      }
    }

    return [...new Set(imports)];
  }

  private _resolveImportPath(importPath: string, sourceFile: string, workspaceRoot: string): string | null {
    const sourceDir = path.dirname(path.join(workspaceRoot, sourceFile));
    let resolved = path.resolve(sourceDir, importPath);

    resolved = resolved.replace(/\\/g, '/');
    const root = workspaceRoot.replace(/\\/g, '/');

    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '', '/index.ts', '/index.tsx', '/index.js'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (fs.existsSync(candidate)) {
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

  // ==================== Message Analysis ====================

  async analyzeMessage(message: string, workspaceRoot: string): Promise<{
    mentionedFiles: string[];
    symbolFiles: string[];
  }> {
    const mentionedFiles: string[] = [];
    const symbolFiles: string[] = [];

    // 1. Extract file names from message
    const fileNames = new Set<string>();
    let match: RegExpExecArray | null;

    const fnRegex = new RegExp(FILE_NAME_PATTERN.source, FILE_NAME_PATTERN.flags);
    while ((match = fnRegex.exec(message)) !== null) {
      fileNames.add(match[1]);
    }

    // 2. Extract path fragments
    const pathRegex = new RegExp(PATH_PATTERN.source, PATH_PATTERN.flags);
    while ((match = pathRegex.exec(message)) !== null) {
      fileNames.add(match[1]);
    }

    // 3. Find matching files in workspace
    if (fileNames.size > 0) {
      try {
        for (const name of fileNames) {
          const glob = name.includes('/') ? `**/${name}*` : `**/${name}`;
          const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 3);
          for (const uri of uris) {
            const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
            if (!mentionedFiles.includes(rel)) mentionedFiles.push(rel);
          }
          if (mentionedFiles.length >= 10) break;
        }
      } catch { /* search failed */ }
    }

    // 4. Extract symbol names from message
    const symbols = new Set<string>();
    const symRegex = new RegExp(SYMBOL_PATTERN.source, SYMBOL_PATTERN.flags);
    while ((match = symRegex.exec(message)) !== null) {
      const sym = match[1];
      // Filter out common words that look like PascalCase
      if (sym.length >= 4 && !['This', 'That', 'When', 'Then', 'What', 'From', 'Into', 'With'].includes(sym)) {
        symbols.add(sym);
      }
    }
    const funcRegex = new RegExp(FUNCTION_PATTERN.source, FUNCTION_PATTERN.flags);
    while ((match = funcRegex.exec(message)) !== null) {
      symbols.add(match[1]);
    }

    // 5. Search for files exporting these symbols (limited scan)
    if (symbols.size > 0) {
      try {
        const uris = await vscode.workspace.findFiles(
          '**/*.{ts,tsx,js,jsx}',
          '**/node_modules/**,**/.git/**,**/dist/**,**/out/**',
          500,
        );

        const symbolArray = [...symbols];
        for (const uri of uris) {
          if (symbolFiles.length >= 5) break;
          const rel = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
          if (mentionedFiles.includes(rel)) continue;

          try {
            const content = fs.readFileSync(uri.fsPath, 'utf8');
            const exports = this.extractExportedSymbols(content);
            if (exports.some((exp) => symbolArray.includes(exp))) {
              symbolFiles.push(rel);
            }
          } catch { /* skip */ }
        }
      } catch { /* search failed */ }
    }

    return { mentionedFiles: mentionedFiles.slice(0, 5), symbolFiles: symbolFiles.slice(0, 5) };
  }

  // ==================== Associated File Discovery ====================

  private _findAssociatedFiles(filePath: string, workspaceRoot: string): string[] {
    const result: string[] = [];
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const dir = path.dirname(filePath);

    const candidates = [
      // Test files
      path.join(dir, `${baseName}.test${ext}`),
      path.join(dir, `${baseName}.spec${ext}`),
      path.join(dir, `${baseName}.test.ts`),
      path.join(dir, `${baseName}.test.tsx`),
      path.join(dir, `${baseName}.spec.ts`),
      path.join(dir, '__tests__', `${baseName}${ext}`),
      path.join(dir, '__tests__', `${baseName}.ts`),
      path.join(dir, '__tests__', `${baseName}.tsx`),
      // Type definition files
      path.join(dir, `${baseName}.d.ts`),
      path.join(dir, 'types.ts'),
    ];

    for (const candidate of candidates) {
      const normalized = candidate.replace(/\\/g, '/');
      if (normalized === filePath.replace(/\\/g, '/')) continue;
      const abs = path.join(workspaceRoot, normalized);
      if (fs.existsSync(abs)) {
        result.push(normalized);
      }
    }
    return result;
  }

  // ==================== Git Changed Files ====================

  private _getGitChangedFiles(workspaceRoot: string): string[] {
    try {
      const cmd = process.platform === 'win32'
        ? 'git diff --name-only HEAD & git diff --name-only --staged'
        : 'git diff --name-only HEAD; git diff --name-only --staged';
      const result = cp.execSync(cmd, {
        cwd: workspaceRoot,
        timeout: 2000,
        encoding: 'utf8',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return [...new Set(
        result.split('\n').map((l) => l.trim().replace(/\\/g, '/')).filter(Boolean),
      )];
    } catch {
      return [];
    }
  }

  // ==================== File Content Reading ====================

  private _readFileContent(absPath: string, maxLines: number): string | null {
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const lines = content.split('\n');
      const totalLines = lines.length;
      if (totalLines <= maxLines) {
        return content.substring(0, MAX_FILE_CONTENT_CHARS);
      }
      const truncated = lines.slice(0, maxLines).join('\n');
      return truncated.substring(0, MAX_FILE_CONTENT_CHARS) + `\n... (${totalLines - maxLines} more lines)`;
    } catch {
      return null;
    }
  }

  // ==================== Context Block Builder ====================

  async buildContextBlock(options: {
    activeFile: string | null;
    editorSelection: { filePath: string; text: string } | null;
    workspaceRoot: string;
    maxFiles: number;
    includeImports: boolean;
    includeRecentFiles: boolean;
    userMessage?: string;
    includeFileContents?: boolean;
    includeGitChanges?: boolean;
    maxContentLines?: number;
  }): Promise<{ contextBlock: string; info: AutoContextInfo }> {
    const {
      activeFile, workspaceRoot, maxFiles,
      includeImports, includeRecentFiles,
      userMessage = '', includeFileContents = true,
      includeGitChanges = true, maxContentLines = 80,
    } = options;

    // Track files by source for ranking
    const fileSourceMap = new Map<string, string>(); // path → source tag
    const addFile = (filePath: string, source: string) => {
      if (!fileSourceMap.has(filePath) && fileSourceMap.size < maxFiles) {
        fileSourceMap.set(filePath, source);
      }
    };

    // Collect files from all sources
    const messageMentionedFiles: string[] = [];
    const gitChangedFiles: string[] = [];
    const importedFiles: string[] = [];
    const recentFilesList: string[] = [];
    const associatedFiles: string[] = [];

    // 1. Message-mentioned files (highest priority)
    if (userMessage) {
      const analysis = await this.analyzeMessage(userMessage, workspaceRoot);
      for (const f of analysis.mentionedFiles) {
        addFile(f, 'mentioned');
        messageMentionedFiles.push(f);
      }
      for (const f of analysis.symbolFiles) {
        addFile(f, 'symbol');
        messageMentionedFiles.push(f);
      }
    }

    // 2. Active file imports
    if (includeImports && activeFile) {
      const imports = await this.getImportedFiles(activeFile, workspaceRoot, 2);
      for (const imp of imports) {
        addFile(imp, 'imported');
        importedFiles.push(imp);
      }
    }

    // 3. Associated files (test/type) for active + mentioned files
    const filesToFindAssociations = [
      ...(activeFile ? [activeFile] : []),
      ...messageMentionedFiles,
    ];
    for (const f of filesToFindAssociations) {
      const associated = this._findAssociatedFiles(f, workspaceRoot);
      for (const a of associated) {
        addFile(a, 'associated');
        associatedFiles.push(a);
      }
    }

    // 4. Git changed files
    if (includeGitChanges) {
      const changed = this._getGitChangedFiles(workspaceRoot);
      for (const f of changed) {
        addFile(f, 'git-changed');
        gitChangedFiles.push(f);
      }
    }

    // 5. Recent files (lowest priority)
    if (includeRecentFiles) {
      for (const recent of this._recentFiles) {
        if (recent.path !== activeFile && !fileSourceMap.has(recent.path)) {
          addFile(recent.path, 'recent');
          recentFilesList.push(recent.path);
        }
      }
    }

    const info: AutoContextInfo = {
      importedFiles,
      recentFiles: recentFilesList,
      activeFile,
      totalFiles: fileSourceMap.size,
      enabled: true,
      gitChangedFiles,
      messageMentionedFiles,
      totalContentChars: 0,
    };

    if (fileSourceMap.size === 0 && !activeFile) {
      return { contextBlock: '', info: { ...info, totalFiles: 0 } };
    }

    // Build the context block
    const sections: string[] = ['[Auto Context]'];
    if (activeFile) sections.push(`Active file: ${activeFile}`);

    let totalChars = 0;

    // Include file contents if enabled
    if (includeFileContents) {
      // Active file first (with more lines)
      if (activeFile) {
        const absPath = path.join(workspaceRoot, activeFile);
        const content = this._readFileContent(absPath, maxContentLines);
        if (content) {
          const lineCount = fs.existsSync(absPath)
            ? fs.readFileSync(absPath, 'utf8').split('\n').length
            : 0;
          sections.push('');
          sections.push(`--- ${activeFile} (active, ${lineCount} lines) ---`);
          sections.push(content);
          totalChars += content.length;
        }
      }

      // Then other collected files
      for (const [filePath, source] of fileSourceMap) {
        if (filePath === activeFile) continue;
        if (totalChars >= MAX_TOTAL_CONTENT_CHARS) break;

        const absPath = path.join(workspaceRoot, filePath);
        // Use fewer lines for lower-priority files
        const linesForFile = source === 'mentioned' || source === 'symbol'
          ? maxContentLines
          : Math.min(maxContentLines, 50);
        const content = this._readFileContent(absPath, linesForFile);
        if (content) {
          sections.push('');
          sections.push(`--- ${filePath} (${source}) ---`);
          sections.push(content);
          totalChars += content.length;
        }
      }
    } else {
      // Fallback: just list file names (old behavior)
      const sources = new Map<string, string[]>();
      for (const [fp, src] of fileSourceMap) {
        if (!sources.has(src)) sources.set(src, []);
        sources.get(src)!.push(fp);
      }
      for (const [src, files] of sources) {
        sections.push(`${src}: ${files.join(', ')}`);
      }
    }

    info.totalContentChars = totalChars;

    return { contextBlock: sections.join('\n'), info };
  }

  dispose(): void {
    while (this._disposables.length) this._disposables.pop()?.dispose();
    this._importCache.clear();
  }
}
