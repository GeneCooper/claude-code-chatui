export function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
export function optStr(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }
export function optBool(v: unknown): boolean | undefined { return typeof v === 'boolean' ? v : undefined; }
export function optStrArr(v: unknown): string[] | undefined { return Array.isArray(v) ? v as string[] : undefined; }
