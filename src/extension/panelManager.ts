import * as vscode from 'vscode';
import { ClaudeService } from './claude';
import type { PermissionService } from './claude';
import type { ConversationService, MCPService } from './storage';
import { PanelProvider, getWebviewHtml } from './panel';
import type { ConversationMessage } from '../shared/types';
import type { ContextCollector } from './contextCollector';
import type { RulesService } from './rulesService';
import type { ProjectProfiler } from './projectProfiler';
import type { IntentAnalyzer } from './intentAnalyzer';

export class PanelManager {
  private _panels = new Map<string, { provider: PanelProvider; claudeService: ClaudeService; panel: vscode.WebviewPanel }>();
  private _panelCounter = 0;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _permissionService: PermissionService,
    private readonly _contextCollector?: ContextCollector,
    private readonly _rulesService?: RulesService,
    private readonly _projectProfiler?: ProjectProfiler,
    private readonly _intentAnalyzer?: IntentAnalyzer,
  ) {}

  createNewPanel(
    column: vscode.ViewColumn = vscode.ViewColumn.Two,
    preserveFocus = false,
    options?: {
      title?: string;
      initialConversation?: ConversationMessage[];
      sessionId?: string;
      totalCost?: number;
    },
  ): PanelProvider {
    const panelId = `panel-${++this._panelCounter}`;
    const claudeService = new ClaudeService(this._context);

    const provider = new PanelProvider(
      this._extensionUri,
      this._context,
      claudeService,
      this._conversationService,
      this._mcpService,
      this._permissionService,
      this,
      this._contextCollector,
      this._rulesService,
      this._projectProfiler,
      this._intentAnalyzer,
    );

    const panel = vscode.window.createWebviewPanel(
      'claudeCodeChatUI',
      options?.title || 'Claude Code ChatUI',
      { viewColumn: column, preserveFocus },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this._extensionUri] },
    );

    panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png');
    panel.webview.html = getWebviewHtml(panel.webview, this._extensionUri);

    provider.bindToWebview(panel.webview);

    // Lock the editor group so the chat panel stays pinned
    void vscode.commands.executeCommand('workbench.action.lockEditorGroup');

    this._panels.set(panelId, { provider, claudeService, panel });

    panel.onDidDispose(() => {
      provider.dispose();
      claudeService.dispose();
      this._panels.delete(panelId);
    }, null, this._disposables);

    // Load initial conversation if provided
    if (options?.initialConversation) {
      provider.loadConversationData(
        options.initialConversation,
        options.sessionId,
        options.totalCost,
      );
    }

    return provider;
  }

  disposeAll(): void {
    for (const { provider, claudeService, panel } of this._panels.values()) {
      provider.dispose();
      claudeService.dispose();
      panel.dispose();
    }
    this._panels.clear();
    while (this._disposables.length) this._disposables.pop()?.dispose();
  }
}
