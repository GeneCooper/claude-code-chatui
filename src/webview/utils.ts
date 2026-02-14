type DiffOperation = 'equal' | 'insert' | 'delete';

interface DiffLine {
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

interface DiffOptions {
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

// Guard: skip LCS when the matrix would exceed this many cells (prevents UI freeze)
const MAX_LCS_CELLS = 500_000; // e.g. 500x1000 or 700x714

export function computeLineDiff(oldContent: string, newContent: string, options?: DiffOptions): DiffResult {
  const normalize = options?.ignoreWhitespace ? (s: string) => s.trim() : (s: string) => s;

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // For very large files, fall back to simple delete-all/insert-all to avoid O(n*m) freeze
  if (oldLines.length * newLines.length > MAX_LCS_CELLS) {
    const lines: DiffLine[] = [
      ...oldLines.map((content, i): DiffLine => ({ type: 'delete', content, oldLineNumber: i + 1 })),
      ...newLines.map((content, i): DiffLine => ({ type: 'insert', content, newLineNumber: i + 1 })),
    ];
    return { lines, additions: newLines.length, deletions: oldLines.length, unchanged: 0 };
  }

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

// ============================================================================
// Permission Error Detection
// ============================================================================

const PERMISSION_ERROR_PATTERNS = [
  'permission denied',
  'not permitted',
  'access denied',
  'eperm',
  'eacces',
  'operation not permitted',
  'requires approval',
  'permission_error',
  'blocked by policy',
];

export function isPermissionError(content: string): boolean {
  const lower = content.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((p) => lower.includes(p));
}

// ============================================================================
// Usage Limit Timestamp Parsing
// ============================================================================

export function parseUsageLimitTimestamp(text: string): { message: string; resetDate: string } | null {
  const match = text.match(/Claude AI usage limit reached\|(\d+)/);
  if (!match) return null;
  const timestamp = parseInt(match[1], 10);
  const date = new Date(timestamp * 1000);
  return {
    message: 'Claude AI usage limit reached',
    resetDate: date.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }),
  };
}
