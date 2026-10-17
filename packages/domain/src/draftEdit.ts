import type { WorkspaceCommand } from './commands/workspace';
import type { Id } from './model/types';

const DRAFT_REVIEW_STEPS = new Set(['review/submit', 'review/new-draft', 'review/discard-draft']);

/** The room whose draft this command changes, or null. Claims (one editor per draft) apply only to these. */
export function draftEditRoom(command: WorkspaceCommand): Id | null {
  if (command.type === 'plan' || command.type === 'draft/replace') return command.roomId;
  if (command.type === 'review' && DRAFT_REVIEW_STEPS.has(command.command.type)) return command.roomId;
  return null;
}
