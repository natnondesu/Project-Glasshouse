import type { Blocker, HistoryEvent, Issue } from '@glasshouse/domain';
import type { Messages } from '../../i18n';
import { recordedName, type Directory } from '../../ui/person';

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

/** English wording as recorded, with the signer's name swapped for its marked form where the line puts it. */
function markRecorded(event: HistoryEvent, by: string, marked: string): string {
  if (event.code === 'submitted' || event.code === 'approved') return event.action.replace(`by ${by}`, `by ${marked}`);
  return event.action.startsWith(by) ? marked + event.action.slice(by.length) : event.action;
}

/**
 * Older events have no code and keep the English they were recorded with. A line whose signer's account has since
 * been removed keeps the recorded name, marked removed.
 */
export function historyText(m: Messages, event: HistoryEvent, people?: Directory): string {
  const by = typeof event.params?.by === 'string' ? event.params.by : null;
  const byId = typeof event.params?.byId === 'string' ? event.params.byId : undefined;
  const marked = by !== null && people ? recordedName(m, by, byId, people) : null;
  if (by !== null && marked !== null && marked !== by) {
    const phrase = event.code && m.history[event.code];
    return (phrase && phrase({ ...event.params, by: marked })) || markRecorded(event, by, marked);
  }
  return (event.code && m.history[event.code]?.(event.params ?? {})) || event.action;
}
