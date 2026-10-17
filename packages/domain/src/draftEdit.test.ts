import { describe, expect, it } from 'vitest';
import type { WorkspaceCommand } from './commands/workspace';
import { draftEditRoom } from './draftEdit';

describe('draftEditRoom', () => {
  it('names the room for commands that change its draft', () => {
    const cases: WorkspaceCommand[] = [
      { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 8 } } },
      { type: 'draft/replace', roomId: 'r', content: {} as never, expected: {} as never },
      { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: 't' } },
      { type: 'review', roomId: 'r', command: { type: 'review/new-draft', at: 't' } },
      { type: 'review', roomId: 'r', command: { type: 'review/discard-draft', at: 't' } },
    ];
    for (const c of cases) expect(draftEditRoom(c)).toBe('r');
  });

  it('is null for everything else, including approvals, notes and equipment state', () => {
    const cases: WorkspaceCommand[] = [
      { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'R', at: 't' } },
      { type: 'review', roomId: 'r', command: { type: 'note/add', id: 'n', text: 'hi', at: 't' } },
      { type: 'review', roomId: 'r', command: { type: 'review/acknowledge', reservedRangeId: 'x', reason: 'r', by: 'b', at: 't' } },
      { type: 'equipment/state', roomId: 'r', ids: [], state: 'deployed' },
      { type: 'rack/order', roomId: 'r', ids: null },
      { type: 'room/rename', roomId: 'r', name: 'n' },
      { type: 'project/create', id: 'p', name: 'P' },
    ];
    for (const c of cases) expect(draftEditRoom(c)).toBeNull();
  });
});
