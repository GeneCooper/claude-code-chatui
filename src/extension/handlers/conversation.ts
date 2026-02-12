import type { MessageHandler } from './types';
import { str } from './helpers';

export const handleGetConversationList: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
};

export const handleLoadConversation: MessageHandler = (msg, ctx) => { void ctx.loadConversation(str(msg.filename)); };

export const handleDeleteConversation: MessageHandler = async (msg, ctx) => {
  const success = await ctx.conversationService.deleteConversation(str(msg.filename));
  if (success) {
    ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to delete conversation' });
  }
};

export const handleSearchConversations: MessageHandler = (msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.searchConversations(str(msg.query)) });
};

export const handleExportConversation: MessageHandler = (msg, ctx) => {
  const json = ctx.conversationService.exportConversation(str(msg.filename));
  if (json) {
    ctx.postMessage({ type: 'conversationExport', data: { filename: msg.filename, content: json } });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to export conversation' });
  }
};
