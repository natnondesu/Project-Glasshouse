import type { HistoryEvent, Plan } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { messagesFor } from '../../i18n';
import { directoryOf } from '../../ui/person';
import { historyText, historySignerId } from './issueText';

const m = messagesFor('en');
const gone = directoryOf({}, ['u1']);
const AT = '2026-10-18T09:00:00.000Z';
const approved = (by: string, byId?: string): HistoryEvent => ({ revision: 1, action: `Approved by ${by}`, at: AT, code: 'approved', params: { by, verified: 1, ...(byId ? { byId } : {}) } });

describe('historyText', () => {
  it('puts a name containing replacement patterns in the line as written', () => {
    expect(historyText(m, approved('Ploy $& $1 $$', 'u1'), gone)).toBe('Approved by Ploy $& $1 $$ (removed)');
    const note: HistoryEvent = { revision: 1, action: '$&Ploy added a note', at: AT, code: 'note_added', params: { by: '$&Ploy', verified: 1, byId: 'u1' } };
    expect(historyText(m, note, gone)).toBe('$&Ploy (removed) added a note');
  });

  it('leaves the line alone for a present person or a typed name', () => {
    expect(historyText(m, approved('Ploy', 'u2'), directoryOf({ u2: { name: 'Ploy', email: 'p@x' } }))).toBe('Approved by Ploy');
    expect(historyText(m, approved('Ploy'), gone)).toBe('Approved by Ploy');
  });
});

describe('historySignerId: ids for lines recorded before they carried one', () => {
  const person = (name: string, userId?: string) => ({ name, at: AT, ...(userId ? { userId } : {}) });
  const plan = {
    revisions: [
      { number: 1, designedBy: person('Ploy', 'u-ploy'), approvedBy: person('Nok', 'u-nok'), acknowledgements: [{ reservedRangeId: 'r', reason: 'x', by: person('Somchai', 'u-som') }] },
    ],
    notes: [{ id: 'n', text: 't', revision: 1, createdAt: AT, by: 'Dao', byId: 'u-dao' }],
    history: [],
  } as unknown as Plan;
  const old = (code: HistoryEvent['code'], by: string): HistoryEvent => ({ revision: 1, action: '', at: AT, code, params: { by, verified: 1 } });

  it('recovers the submitter, approver, acknowledger and note author from the revision and notes', () => {
    expect(historySignerId(plan, old('submitted', 'Ploy'))).toBe('u-ploy');
    expect(historySignerId(plan, old('approved', 'Nok'))).toBe('u-nok');
    expect(historySignerId(plan, old('acknowledged', 'Somchai'))).toBe('u-som');
    expect(historySignerId(plan, old('note_added', 'Dao'))).toBe('u-dao');
  });

  it('keeps the id a line already carries, and recovers nothing it cannot match', () => {
    expect(historySignerId(plan, approved('Nok', 'u-own'))).toBe('u-own');
    expect(historySignerId(plan, old('approved', 'Someone else'))).toBeUndefined();
    expect(historySignerId(plan, { ...old('note_added', 'Dao'), at: 'other time' })).toBeUndefined();
    expect(historySignerId(plan, { revision: 1, action: 'Started draft', at: AT, code: 'new_draft', params: { from: 1, to: 2 } })).toBeUndefined();
  });
});
