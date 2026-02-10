/**
 * Todo Utilities
 *
 * Extract and process TodoWrite data from tool inputs.
 *
 * @module webview/utils/todos
 */

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
  priority?: string;
}

/**
 * Extract TodoItems from a TodoWrite tool's raw input.
 */
export function extractTodosFromInput(rawInput: Record<string, unknown>): TodoItem[] {
  const todos = rawInput?.todos;
  if (!Array.isArray(todos)) return [];

  return todos.map((todo) => ({
    content: typeof todo.content === 'string' ? todo.content : '',
    status: (['pending', 'in_progress', 'completed'].includes(todo.status) ? todo.status : 'pending') as TodoItem['status'],
    activeForm: typeof todo.activeForm === 'string' ? todo.activeForm : undefined,
    priority: typeof todo.priority === 'string' ? todo.priority : undefined,
  }));
}

/**
 * Get the status icon for a todo item.
 */
export function getTodoStatusIcon(status: TodoItem['status']): string {
  switch (status) {
    case 'completed': return '\u2705';
    case 'in_progress': return '\uD83D\uDD04';
    case 'pending': return '\u23F3';
    default: return '\u23F3';
  }
}

/**
 * Calculate todo completion stats.
 */
export function getTodoStats(todos: TodoItem[]): { total: number; completed: number; inProgress: number; pending: number } {
  return {
    total: todos.length,
    completed: todos.filter((t) => t.status === 'completed').length,
    inProgress: todos.filter((t) => t.status === 'in_progress').length,
    pending: todos.filter((t) => t.status === 'pending').length,
  };
}
