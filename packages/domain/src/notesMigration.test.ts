import { expect, it } from 'vitest';
import { migrate } from './migrations';

it('upgrades schema 8: notes move onto the revision they were added on, resolving leaves the history', () => {
  const plan = {
    revisions: [{ number: 1 }, { number: 2 }],
    notes: [
      { id: 'a', text: 'Old, resolved', resolved: true, createdAt: 't1' },
      { id: 'b', text: 'No history line', resolved: false, createdAt: 't9' },
    ],
    history: [
      { revision: 1, action: 'Added a review note', at: 't1', code: 'note_added' },
      { revision: 1, action: 'Resolved a review note', at: 't2', code: 'note_resolved' },
      { revision: 2, action: 'Reopened a review note', at: 't3' },
      { revision: 2, action: 'Started Draft revision 2 from revision 1', at: 't4', code: 'new_draft' },
    ],
    equipmentState: {},
  };
  const raw = { schemaVersion: 8, catalog: [], lastBackupAt: null, projects: [{ id: 'p', name: 'P', notes: '', isSample: false, sites: [{ id: 's', name: 'S', notes: '', rooms: [{ id: 'r', name: 'R', notes: '', plan }] }] }] };
  const up = migrate(raw);
  if (!up.ok) throw new Error(up.error.message);
  const out = (up.value as { projects: { sites: { rooms: { plan: { notes: unknown[]; history: { action: string }[] } }[] }[] }[] }).projects[0]!.sites[0]!.rooms[0]!.plan;
  expect(out.notes).toEqual([
    { id: 'a', text: 'Old, resolved', createdAt: 't1', revision: 1 },
    { id: 'b', text: 'No history line', createdAt: 't9', revision: 2 },
  ]);
  expect(out.history.map((e) => e.action)).toEqual(['Added a review note', 'Started Draft revision 2 from revision 1']);
});
