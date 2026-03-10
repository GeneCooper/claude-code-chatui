import type { DiagnosticItem } from '../shared/types'

/**
 * Parse compiler/linter output from Bash tool results into structured diagnostics.
 * Supports: TypeScript (tsc), ESLint, Go, Rust (rustc/cargo), Python, GCC/Clang, Jest/Vitest.
 */

interface ParsedDiagnostics {
  filePath: string
  diagnostics: DiagnosticItem[]
}

// TypeScript: src/foo.ts(10,5): error TS2304: Cannot find name 'x'.
// Also: src/foo.ts:10:5 - error TS2304: Cannot find name 'x'.
const TSC_PATTERN = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/
const TSC_ALT_PATTERN = /^(.+?):(\d+):(\d+)\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/

// ESLint: /path/to/file.ts:10:5: error some-rule: message
// Also:   10:5  error  message  rule-name
const ESLINT_FILE_HEADER = /^(\/[^\s]+|[A-Z]:\\[^\s]+)$/
const ESLINT_INLINE = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([\w@/-]+)\s*$/

// Go: ./main.go:10:5: undefined: foo
const GO_PATTERN = /^(.+?\.go):(\d+):(\d+):\s*(.+)$/

// Rust (cargo): error[E0425]: cannot find value `x`
//    --> src/main.rs:10:5
const RUST_LOC_PATTERN = /^\s*-->\s*(.+?):(\d+):(\d+)\s*$/

// GCC/Clang: file.c:10:5: error: message
const GCC_PATTERN = /^(.+?\.[chm](?:pp|xx)?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/

// Python: File "foo.py", line 10
const PYTHON_PATTERN = /^\s*File "(.+?)", line (\d+)/

// Jest/Vitest: FAIL src/foo.test.ts  or  ● Test suite failed
const JEST_FAIL_PATTERN = /^\s*(FAIL)\s+(.+)$/

export function parseBashDiagnostics(content: string, command?: string): ParsedDiagnostics[] {
  const lines = content.split('\n')
  const fileMap = new Map<string, DiagnosticItem[]>()

  const addDiag = (filePath: string, diag: DiagnosticItem) => {
    const existing = fileMap.get(filePath) || []
    existing.push(diag)
    fileMap.set(filePath, existing)
  }

  let currentEslintFile: string | null = null
  let pendingRustSeverity: 'error' | 'warning' | null = null
  let pendingRustMessage = ''
  let pendingRustCode = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // TypeScript
    let m = line.match(TSC_PATTERN) || line.match(TSC_ALT_PATTERN)
    if (m) {
      addDiag(m[1], {
        severity: m[4] as 'error' | 'warning',
        line: parseInt(m[2]),
        column: parseInt(m[3]),
        code: m[5],
        source: 'ts',
        message: m[6],
      })
      continue
    }

    // ESLint file header
    if (ESLINT_FILE_HEADER.test(line.trim())) {
      currentEslintFile = line.trim()
      continue
    }

    // ESLint inline
    m = line.match(ESLINT_INLINE)
    if (m && currentEslintFile) {
      addDiag(currentEslintFile, {
        severity: m[3] as 'error' | 'warning',
        line: parseInt(m[1]),
        column: parseInt(m[2]),
        source: 'eslint',
        code: m[5],
        message: m[4],
      })
      continue
    }

    // Go
    m = line.match(GO_PATTERN)
    if (m) {
      addDiag(m[1], {
        severity: 'error',
        line: parseInt(m[2]),
        column: parseInt(m[3]),
        source: 'go',
        message: m[4],
      })
      continue
    }

    // Rust — two-line pattern
    const rustSevMatch = line.match(/^(error|warning)(?:\[([A-Z]\d+)\])?:\s*(.+)$/)
    if (rustSevMatch) {
      pendingRustSeverity = rustSevMatch[1] as 'error' | 'warning'
      pendingRustCode = rustSevMatch[2] || ''
      pendingRustMessage = rustSevMatch[3]
      continue
    }
    if (pendingRustSeverity) {
      m = line.match(RUST_LOC_PATTERN)
      if (m) {
        addDiag(m[1], {
          severity: pendingRustSeverity,
          line: parseInt(m[2]),
          column: parseInt(m[3]),
          source: 'rustc',
          code: pendingRustCode || undefined,
          message: pendingRustMessage,
        })
        pendingRustSeverity = null
        continue
      }
      // No location found, reset
      if (!line.startsWith(' ')) pendingRustSeverity = null
    }

    // GCC/Clang
    m = line.match(GCC_PATTERN)
    if (m) {
      addDiag(m[1], {
        severity: m[4] === 'note' ? 'info' : m[4] as 'error' | 'warning',
        line: parseInt(m[2]),
        column: parseInt(m[3]),
        source: 'gcc',
        message: m[5],
      })
      continue
    }

    // Python traceback
    m = line.match(PYTHON_PATTERN)
    if (m) {
      const nextLine = lines[i + 1]?.trim()
      const errorLine = lines[i + 2]?.trim()
      addDiag(m[1], {
        severity: 'error',
        line: parseInt(m[2]),
        column: 1,
        source: 'python',
        message: errorLine || nextLine || 'Error',
      })
      continue
    }

    // Reset ESLint file context on blank lines
    if (line.trim() === '') {
      currentEslintFile = null
    }
  }

  return Array.from(fileMap.entries()).map(([filePath, diagnostics]) => ({
    filePath,
    diagnostics: diagnostics.slice(0, 20),
  }))
}

/**
 * Check if Bash output likely contains compiler/linter errors worth parsing.
 */
export function hasDiagnosticPatterns(content: string, command?: string): boolean {
  // Quick check: does it look like a compile/lint command?
  const compileCommands = ['tsc', 'eslint', 'npx tsc', 'npm run build', 'npm run lint', 'go build', 'go vet', 'cargo build', 'cargo check', 'rustc', 'gcc', 'g++', 'clang', 'python', 'pytest', 'jest', 'vitest']
  const hasCompileCmd = command && compileCommands.some(c => command.includes(c))

  // Quick check: does it contain error-like patterns?
  const hasErrorPattern = /(?:error(?:\[|\s+TS)|:\d+:\d+:?\s*(?:error|warning)|FAIL\s+\S)/i.test(content)

  return !!(hasCompileCmd || hasErrorPattern)
}
