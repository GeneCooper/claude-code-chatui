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

/**
 * Myers diff algorithm — O((N+M)*D) where D is the edit distance.
 * For small edits on large files this is dramatically faster than O(N*M) LCS
 * and never needs to fall back to "delete-all / insert-all".
 */
function myersDiff<T>(
  a: T[],
  b: T[],
  compare: (x: T, y: T) => boolean,
): Array<{ type: DiffOperation; value: T; oldIndex?: number; newIndex?: number }> {
  const N = a.length;
  const M = b.length;
  const MAX = N + M;

  // Fast path: one side empty
  if (N === 0 && M === 0) return [];
  if (N === 0) return b.map((v, i) => ({ type: 'insert' as const, value: v, newIndex: i + 1 }));
  if (M === 0) return a.map((v, i) => ({ type: 'delete' as const, value: v, oldIndex: i + 1 }));

  // V array indexed by k ∈ [-MAX..MAX], stored with offset MAX
  const size = 2 * MAX + 1;
  const v = new Int32Array(size);
  // Store the trace of V snapshots for backtracking
  const trace: Int32Array[] = [];

  // Forward pass
  outer:
  for (let d = 0; d <= MAX; d++) {
    // Save a copy of v for backtracking
    trace.push(v.slice());

    for (let k = -d; k <= d; k += 2) {
      const kOff = k + MAX;
      let x: number;
      if (k === -d || (k !== d && v[kOff - 1] < v[kOff + 1])) {
        x = v[kOff + 1]; // move down
      } else {
        x = v[kOff - 1] + 1; // move right
      }
      let y = x - k;

      // Follow diagonal (matching lines)
      while (x < N && y < M && compare(a[x], b[y])) {
        x++;
        y++;
      }

      v[kOff] = x;

      if (x >= N && y >= M) {
        break outer;
      }
    }
  }

  // Backtrack to recover the edit script
  let x = N;
  let y = M;
  const edits: Array<{ type: DiffOperation; value: T; oldIndex?: number; newIndex?: number }> = [];

  for (let d = trace.length - 1; d >= 0; d--) {
    const vPrev = trace[d];
    const k = x - y;
    const kOff = k + MAX;

    let prevK: number;
    if (k === -d || (k !== d && vPrev[kOff - 1] < vPrev[kOff + 1])) {
      prevK = k + 1; // came from above (insert)
    } else {
      prevK = k - 1; // came from left (delete)
    }

    let prevX = vPrev[prevK + MAX];
    let prevY = prevX - prevK;

    // Diagonal moves (equal lines)
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ type: 'equal', value: a[x], oldIndex: x + 1, newIndex: y + 1 });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.push({ type: 'insert', value: b[y], newIndex: y + 1 });
      } else {
        // Delete
        x--;
        edits.push({ type: 'delete', value: a[x], oldIndex: x + 1 });
      }
    }
  }

  edits.reverse();
  return edits;
}

export function computeLineDiff(oldContent: string, newContent: string, options?: DiffOptions): DiffResult {
  const normalize = options?.ignoreWhitespace ? (s: string) => s.trim() : (s: string) => s;

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const compare = (a: string, b: string) => normalize(a) === normalize(b);
  const ops = myersDiff(oldLines, newLines, compare);

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
