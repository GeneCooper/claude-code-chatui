import * as vscode from 'vscode';
import type { PanelProvider } from './PanelProvider';

/**
 * Sidebar webview view provider.
 * Delegates all logic to the shared PanelProvider instance.
 */
export class WebviewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _panelProvider: PanelProvider,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this._panelProvider.showInWebview(webviewView.webview, webviewView);

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._panelProvider.closeMainPanel();
        this._panelProvider.reinitializeWebview();
      }
    });
  }
}
