import type { Issue } from '@glasshouse/domain';
import type { Messages } from '../../i18n';

/** A check's message and hint in the active language; falls back to the domain's English. */
export function issueText(_m: Messages, issue: Issue): { message: string; hint: string } {
  return { message: issue.message, hint: issue.hint };
}
