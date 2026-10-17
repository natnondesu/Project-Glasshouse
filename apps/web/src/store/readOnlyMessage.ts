import type { Messages } from '../i18n';
import type { ReadOnlyReason } from './workspaceStore';

/** Why an edit was refused, in the words for that reason (a viewer is not "in another tab"). */
export function readOnlyMessage(m: Messages, reason: ReadOnlyReason | null): string {
  if (reason === 'view-only') return m.shell.viewOnly;
  if (reason === 'offline') return m.shell.offlineRefused;
  return m.backup.readOnlyTab;
}
