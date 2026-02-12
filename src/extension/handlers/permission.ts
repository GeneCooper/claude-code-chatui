import type { MessageHandler } from './types';
import { str } from './helpers';

export const handlePermissionResponse: MessageHandler = (msg, ctx) => {
  const id = str(msg.id);
  const approved = msg.approved === true;
  ctx.claudeService.sendPermissionResponse(id, approved, typeof msg.alwaysAllow === 'boolean' ? msg.alwaysAllow : undefined);
  ctx.postMessage({ type: 'updatePermissionStatus', data: { id, status: approved ? 'approved' : 'denied' } });
};

export const handleGetPermissions: MessageHandler = async (_msg, ctx) => {
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

export const handleAddPermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.addPermission(str(msg.toolName), str(msg.pattern));
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

export const handleRemovePermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.removePermission(str(msg.toolName), str(msg.pattern));
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};
