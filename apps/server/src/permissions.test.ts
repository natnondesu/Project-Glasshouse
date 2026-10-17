import { describe, expect, it } from 'vitest';
import type { WorkspaceCommand } from '@glasshouse/domain';
import { requiredRole, stampCommand } from './permissions';

const review = (command: object) => ({ type: 'review', roomId: 'r', command }) as WorkspaceCommand;

describe('requiredRole', () => {
  it('follows the role matrix', () => {
    expect(requiredRole({ type: 'room/rename', roomId: 'r', name: 'X' })).toBe('editor');
    expect(requiredRole({ type: 'project/import', file: {} as never, resolution: {} as never })).toBe('editor');
    expect(requiredRole(review({ type: 'review/submit', designedBy: '', at: 't' }))).toBe('editor');
    expect(requiredRole(review({ type: 'note/add', id: 'n', text: 'x', at: 't' }))).toBe('editor');
    expect(requiredRole(review({ type: 'review/approve', reviewer: 'x', at: 't' }))).toBe('reviewer');
    expect(requiredRole(review({ type: 'review/acknowledge', reservedRangeId: 'x', reason: 'y', by: 'z', at: 't' }))).toBe('reviewer');
    expect(requiredRole({ type: 'template/delete', id: 't' })).toBe('admin');
    expect(requiredRole({ type: 'catalog/import', templates: [] })).toBe('admin');
    expect(requiredRole({ type: 'project/delete', projectId: 'p' })).toBe('admin');
  });
});

describe('stampCommand', () => {
  const me = { id: 'u-nok', name: 'Nok P.' };
  it('writes the signed-in person and the server time over whatever the browser sent', () => {
    expect(stampCommand(review({ type: 'review/approve', reviewer: 'Someone Else', at: 'client', byId: 'spoof' }), me, 'server')).toEqual(review({ type: 'review/approve', reviewer: 'Nok P.', at: 'server', byId: 'u-nok' }));
    expect(stampCommand(review({ type: 'note/add', id: 'n', text: 'x', at: 'client' }), me, 'server')).toEqual(review({ type: 'note/add', id: 'n', text: 'x', at: 'server', by: 'Nok P.', byId: 'u-nok' }));
    expect(stampCommand(review({ type: 'review/new-draft', at: 'client' }), me, 'server')).toEqual(review({ type: 'review/new-draft', at: 'server' }));
  });
  it('leaves other commands untouched', () => {
    const c: WorkspaceCommand = { type: 'room/rename', roomId: 'r', name: 'X' };
    expect(stampCommand(c, me, 'server')).toBe(c);
  });
});
