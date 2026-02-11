// ============================================================================
// Optimistic Dedup Tracking
// ============================================================================

// Tracks which messages/actions were done optimistically to avoid duplicates
// when the extension echoes them back

let _pendingOptimisticUserInput = false
const _pendingOptimisticPermissions = new Set<string>()

export function markOptimisticUserInput(): void {
  _pendingOptimisticUserInput = true
}

export function consumeOptimisticUserInput(): boolean {
  if (_pendingOptimisticUserInput) {
    _pendingOptimisticUserInput = false
    return true
  }
  return false
}

export function markOptimisticPermission(id: string): void {
  _pendingOptimisticPermissions.add(id)
}

export function consumeOptimisticPermission(id: string): boolean {
  return _pendingOptimisticPermissions.delete(id)
}
