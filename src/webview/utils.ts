export type DiffOperation = 'equal' | 'insert' | 'delete';

export interface DiffLine {
  type: DiffOperation;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  contextLines?: number;
}

function computeLcsMatrix<T>(a: T[], b: T[], compare: (x: T, y: T) => boolean): number[][] {
  const m = a.length;
  const n = b.length;
  const matrix: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (compare(a[i - 1], b[j - 1])) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  return matrix;
}

function backtrackDiff<T>(
  matrix: number[][],
  a: T[],
  b: T[],
  compare: (x: T, y: T) => boolean,
): Array<{ type: DiffOperation; value: T; oldIndex?: number; newIndex?: number }> {
  const result: Array<{ type: DiffOperation; value: T; oldIndex?: number; newIndex?: number }> = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && compare(a[i - 1], b[j - 1])) {
      result.unshift({ type: 'equal', value: a[i - 1], oldIndex: i, newIndex: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.unshift({ type: 'insert', value: b[j - 1], newIndex: j });
      j--;
    } else {
      result.unshift({ type: 'delete', value: a[i - 1], oldIndex: i });
      i--;
    }
  }

  return result;
}

export function computeLineDiff(oldContent: string, newContent: string, options?: DiffOptions): DiffResult {
  const normalize = options?.ignoreWhitespace ? (s: string) => s.trim() : (s: string) => s;

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const compare = (a: string, b: string) => normalize(a) === normalize(b);
  const matrix = computeLcsMatrix(oldLines, newLines, compare);
  const ops = backtrackDiff(matrix, oldLines, newLines, compare);

  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  for (const op of ops) {
    if (op.type === 'equal') {
      lines.push({ type: 'equal', content: op.value, oldLineNumber: op.oldIndex, newLineNumber: op.newIndex });
      unchanged++;
    } else if (op.type === 'insert') {
      lines.push({ type: 'insert', content: op.value, newLineNumber: op.newIndex });
      additions++;
    } else {
      lines.push({ type: 'delete', content: op.value, oldLineNumber: op.oldIndex });
      deletions++;
    }
  }

  return { lines, additions, deletions, unchanged };
}

export function computeContextualDiff(oldContent: string, newContent: string, options?: DiffOptions): DiffResult {
  const fullDiff = computeLineDiff(oldContent, newContent, options);
  const contextLines = options?.contextLines ?? 3;

  const showIndices = new Set<number>();
  fullDiff.lines.forEach((line, idx) => {
    if (line.type !== 'equal') {
      for (let c = Math.max(0, idx - contextLines); c <= Math.min(fullDiff.lines.length - 1, idx + contextLines); c++) {
        showIndices.add(c);
      }
    }
  });

  const lines: DiffLine[] = [];
  let lastShown = -1;

  fullDiff.lines.forEach((line, idx) => {
    if (showIndices.has(idx)) {
      if (lastShown >= 0 && idx - lastShown > 1) lines.push({ type: 'equal', content: '···' });
      lines.push(line);
      lastShown = idx;
    }
  });

  return { lines, additions: fullDiff.additions, deletions: fullDiff.deletions, unchanged: fullDiff.unchanged };
}

export function formatUnifiedDiff(diff: DiffResult, oldPath: string, newPath: string): string {
  const lines: string[] = [`--- ${oldPath}`, `+++ ${newPath}`];
  for (const line of diff.lines) {
    if (line.type === 'delete') lines.push(`-${line.content}`);
    else if (line.type === 'insert') lines.push(`+${line.content}`);
    else lines.push(` ${line.content}`);
  }
  return lines.join('\n');
}

export function formatDiffStats(diff: DiffResult): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`-${diff.deletions}`);
  if (parts.length === 0) return 'No changes';
  return parts.join(', ');
}

export function applyDiff(oldContent: string, diff: DiffResult): string {
  const result: string[] = [];
  for (const line of diff.lines) {
    if (line.type === 'equal' || line.type === 'insert') result.push(line.content);
  }
  return result.join('\n');
}
