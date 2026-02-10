import * as vscode from 'vscode';

/**
 * In-memory store for diff content, keyed by URI string.
 */
const diffContentStore = new Map<string, string>();

/**
 * Read-only TextDocumentContentProvider for showing diffs.
 * Registers the `claude-diff:` URI scheme.
 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-diff';

  provideTextDocumentContent(uri: vscode.Uri): string {
    return diffContentStore.get(uri.toString()) || '';
  }

  /**
   * Store content for a diff URI and return the URI.
   */
  static storeContent(label: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${label}`);
    diffContentStore.set(uri.toString(), content);
    return uri;
  }

  /**
   * Open a VS Code diff editor comparing old and new content for a file.
   */
  static async openDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
  ): Promise<void> {
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    const timestamp = Date.now();

    const leftUri = DiffContentProvider.storeContent(
      `${fileName}.before.${timestamp}`,
      oldContent,
    );
    const rightUri = DiffContentProvider.storeContent(
      `${fileName}.after.${timestamp}`,
      newContent,
    );

    await vscode.commands.executeCommand(
      'vscode.diff',
      leftUri,
      rightUri,
      `${fileName} (Before ↔ After)`,
      { preview: true },
    );
  }
}
