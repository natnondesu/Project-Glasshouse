import type { Blocker, HistoryEvent, Issue } from '@glasshouse/domain';
import type { Messages } from '../../i18n';

/** A check's message and hint in the active language; English shows the domain's own text. */
export function issueText(m: Messages, issue: Issue): { message: string; hint: string } {
  const phrase = m.issues[issue.code];
  return phrase ? { message: phrase.message(issue.params), hint: phrase.hint(issue.params) } : { message: issue.message, hint: issue.hint };
}

export function blockerText(m: Messages, blocker: Blocker): string {
  const issue = m.issues[blocker.code];
  if (issue) return issue.message(blocker.params);
  return m.blockers[blocker.code]?.(blocker.params) ?? blocker.message;
}

/** Older events have no code and keep the English they were recorded with. */
export function historyText(m: Messages, event: HistoryEvent): string {
  return (event.code && m.history[event.code]?.(event.params ?? {})) || event.action;
}
