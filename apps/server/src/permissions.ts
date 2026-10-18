import type { ReviewCommand, WorkspaceCommand } from '@glasshouse/domain';
import type { Role } from './identity/types';

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', editor: 'Editor', reviewer: 'Reviewer', admin: 'Admin' };

const ADMIN_ONLY = new Set<string>([
  'template/create',
  'template/update',
  'template/delete',
  'catalog/seed',
  'catalog/import',
  'project/delete',
  'project/archive',
  'project/restore',
  'site/archive',
  'site/restore',
  'room/archive',
  'room/restore',
]);
const REVIEWER_ONLY = new Set<ReviewCommand['type']>(['review/approve', 'review/acknowledge', 'review/unacknowledge']);

/** The role matrix (P1 design): everything else is an editor's job. */
export function requiredRole(command: WorkspaceCommand): Role {
  if (ADMIN_ONLY.has(command.type)) return 'admin';
  if (command.type === 'review') return REVIEWER_ONLY.has(command.command.type) ? 'reviewer' : 'editor';
  return 'editor';
}

/** The signed-in person and the server's clock go on review records, whatever the browser sent. */
export function stampCommand(command: WorkspaceCommand, actor: { id: string; name: string }, at: string): WorkspaceCommand {
  if (command.type === 'project/archive' || command.type === 'site/archive' || command.type === 'room/archive') return { ...command, by: actor.name, at };
  if (command.type !== 'review') return command;
  const c = command.command;
  switch (c.type) {
    case 'review/submit':
      return { ...command, command: { ...c, designedBy: actor.name, byId: actor.id, at } };
    case 'review/approve':
      return { ...command, command: { ...c, reviewer: actor.name, byId: actor.id, at } };
    case 'review/acknowledge':
      return { ...command, command: { ...c, by: actor.name, byId: actor.id, at } };
    case 'note/add':
      return { ...command, command: { ...c, by: actor.name, byId: actor.id, at } };
    default:
      return { ...command, command: { ...c, at } };
  }
}
