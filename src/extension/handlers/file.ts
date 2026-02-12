import * as vscode from 'vscode';
import { FILE_SEARCH_EXCLUDES } from '../../shared/constants';
import { DiffContentProvider } from './diff';
import type { MessageHandler } from './types';
import { str, optStr } from './helpers';

export const handleOpenFile: MessageHandler = (msg) => {
  const uri = vscode.Uri.file(str(msg.filePath));
  vscode.workspace.openTextDocument(uri).then((doc) => { vscode.window.showTextDocument(doc, { preview: true }); });
};

export const handleOpenExternal: MessageHandler = (msg) => { void vscode.env.openExternal(vscode.Uri.parse(str(msg.url))); };

export const handleOpenDiff: MessageHandler = async (msg) => {
  const diffConfig = vscode.workspace.getConfiguration('diffEditor');
  if (!diffConfig.get<boolean>('renderSideBySide', true)) {
    await diffConfig.update('renderSideBySide', true, vscode.ConfigurationTarget.Global);
  }
  await DiffContentProvider.openDiff(str(msg.oldContent), str(msg.newContent), str(msg.filePath));
};

export const handleRevertFile: MessageHandler = async (msg, ctx) => {
  try {
    const filePath = str(msg.filePath);
    const uri = vscode.Uri.file(filePath);
    const content = new TextEncoder().encode(str(msg.oldContent));
    await vscode.workspace.fs.writeFile(uri, content);
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    vscode.window.showInformationMessage(`Reverted: ${fileName}`);
    ctx.postMessage({ type: 'fileReverted', data: { filePath: msg.filePath, success: true } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to revert file' });
  }
};

export const handlePickImageFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select Image',
    filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
  });
  if (!result || result.length === 0) return;
  try {
    const data = await vscode.workspace.fs.readFile(result[0]);
    const base64 = Buffer.from(data).toString('base64');
    const ext = result[0].fsPath.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    };
    const name = result[0].fsPath.split(/[\\/]/).pop() || 'image';
    ctx.postMessage({ type: 'imageFilePicked', data: { name, dataUrl: `data:${mimeMap[ext] || 'image/png'};base64,${base64}` } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to read image file' });
  }
};

export const handlePickWorkspaceFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Attach File',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!result || result.length === 0) return;
  for (const uri of result) {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  }
};

export const handleResolveDroppedFile: MessageHandler = (_msg, ctx) => {
  const uriStr = optStr(_msg.uri);
  if (!uriStr) return;
  try {
    const uri = vscode.Uri.parse(uriStr);
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  } catch { /* ignore invalid URIs */ }
};

export const handleGetWorkspaceFiles: MessageHandler = async (msg, ctx) => {
  const searchTerm = optStr(msg.searchTerm);
  try {
    const uris = await vscode.workspace.findFiles('**/*', FILE_SEARCH_EXCLUDES, 500);
    let files = uris.map((uri) => {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const name = relativePath.split(/[\\/]/).pop() || '';
      return { name, path: relativePath, fsPath: uri.fsPath };
    });

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      files = files.filter((f) => f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower));
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    files = files.slice(0, 50);
    ctx.postMessage({ type: 'workspaceFiles', data: files });
  } catch {
    ctx.postMessage({ type: 'workspaceFiles', data: [] });
  }
};

export const handleGetClipboard: MessageHandler = async (_msg, ctx) => {
  try {
    const text = await vscode.env.clipboard.readText();
    ctx.postMessage({ type: 'clipboardContent', data: { text } });
  } catch {
    ctx.postMessage({ type: 'clipboardContent', data: { text: '' } });
  }
};
