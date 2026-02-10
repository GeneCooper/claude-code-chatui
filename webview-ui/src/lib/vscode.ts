/**
 * VS Code Webview API bridge.
 * Provides postMessage and message listener utilities.
 */

interface VSCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// Acquire the VS Code API once
const vscode: VSCodeApi | undefined =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;

/** Send a message to the extension host */
export function postMessage(message: { type: string; [key: string]: unknown }): void {
  vscode?.postMessage(message);
}

/** Get persisted webview state */
export function getState<T>(): T | undefined {
  return vscode?.getState() as T | undefined;
}

/** Set persisted webview state */
export function setState<T>(state: T): void {
  vscode?.setState(state);
}

/** Subscribe to messages from the extension host. Returns unsubscribe function. */
export function onMessage(handler: (message: Record<string, unknown>) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

declare function acquireVsCodeApi(): VSCodeApi;
