import type { MCPServerConfig } from '../../shared/types';
import type { MessageHandler } from './types';
import { str } from './helpers';

export const handleLoadMCPServers: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'mcpServers', data: ctx.mcpService.loadServers() });
};

export const handleSaveMCPServer: MessageHandler = (msg, ctx) => {
  try {
    const name = str(msg.name);
    const config = (typeof msg.config === 'object' && msg.config !== null ? msg.config : {}) as MCPServerConfig;
    ctx.mcpService.saveServer(name, config);
    ctx.postMessage({ type: 'mcpServerSaved', data: { name } });
  } catch {
    ctx.postMessage({ type: 'mcpServerError', data: { error: 'Failed to save MCP server' } });
  }
};

export const handleDeleteMCPServer: MessageHandler = (msg, ctx) => {
  const name = str(msg.name);
  if (ctx.mcpService.deleteServer(name)) {
    ctx.postMessage({ type: 'mcpServerDeleted', data: { name } });
  } else {
    ctx.postMessage({ type: 'mcpServerError', data: { error: `Server "${name}" not found` } });
  }
};
