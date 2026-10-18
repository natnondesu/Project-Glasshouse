import type { DomainError } from '@glasshouse/domain';
import { messagesFor } from '../i18n';
import { useLangStore } from '../i18n/lang';

const KINDS = ['project', 'site', 'room'] as const;
type Kind = (typeof KINDS)[number];
const isKind = (value: string | undefined): value is Kind => KINDS.includes(value as Kind);

/**
 * Domain messages are English. Errors that carry their facts (archived work, a room someone is editing) are re-worded
 * in the viewer's language; anything else is left as it is.
 */
export function localizeError(error: DomainError): DomainError {
  const p = error.params;
  if (!p) return error;
  const m = messagesFor(useLangStore.getState().lang);
  if (error.code === 'room_busy' && p.holder && p.room) return { ...error, message: m.archive.busy(p.holder, p.room) };
  const purpose = p.purpose;
  if (error.code === 'archived' && (purpose === 'edit' || purpose === 'import' || purpose === 'delete') && isKind(p.kind) && isKind(p.sourceKind) && p.name && p.sourceName) {
    return { ...error, message: m.archive.refused(purpose, m.tree.kind[p.kind], p.name, p.own === '1', m.tree.kind[p.sourceKind], p.sourceName) };
  }
  return error;
}
