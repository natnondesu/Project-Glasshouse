import { describe, expect, it } from 'vitest';
import { backupDue, daysSinceBackup, exportBackup, parseBackup } from './backup';
import { apply } from './commands/workspace';
import { createWorkspace } from './factories';
import type { Workspace } from './model/types';

const withProject = (isSample = false): Workspace => {
  const r = apply(createWorkspace(), { type: 'project/create', id: 'p', name: 'Northgate' });
  if (!r.ok) throw new Error(r.error.message);
  return isSample ? { ...r.value, projects: r.value.projects.map((p) => ({ ...p, isSample: true })) } : r.value;
};

describe('workspace backup', () => {
  it('round-trips the whole workspace and records when it was taken', () => {
    const ws = withProject();
    const file = JSON.parse(JSON.stringify(exportBackup(ws, '2026-10-14T00:00:00.000Z')));
    expect(file).toMatchObject({ format: 'glasshouse.workspace', schemaVersion: 7, exportedAt: '2026-10-14T00:00:00.000Z' });
    const restored = parseBackup(file);
    expect(restored.ok && restored.value.projects[0]?.name).toBe('Northgate');
    expect(restored.ok && restored.value.lastBackupAt).toBe('2026-10-14T00:00:00.000Z');
  });

  it('refuses foreign or damaged files with a plain message', () => {
    expect(parseBackup({ hello: 'world' })).toMatchObject({ ok: false, error: { message: "This isn't a Glasshouse workspace backup." } });
    expect(parseBackup({ format: 'glasshouse.workspace', workspace: { schemaVersion: 1, projects: 'x' } })).toMatchObject({ ok: false });
  });

  it('marks the backup time through a command', () => {
    const r = apply(withProject(), { type: 'backup/mark', at: '2026-10-14T00:00:00.000Z' });
    expect(r.ok && r.value.lastBackupAt).toBe('2026-10-14T00:00:00.000Z');
  });
});

describe('backup reminder', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');
  it('is quiet with only the sample project, due without any backup, and due after seven days', () => {
    expect(backupDue(withProject(true), now)).toBe(false);
    expect(backupDue(withProject(), now)).toBe(true);
    expect(daysSinceBackup({ ...withProject(), lastBackupAt: '2026-10-14T00:00:00.000Z' }, now)).toBe(6);
    expect(backupDue({ ...withProject(), lastBackupAt: '2026-10-14T00:00:00.000Z' }, now)).toBe(false);
    expect(backupDue({ ...withProject(), lastBackupAt: '2026-10-12T23:00:00.000Z' }, now)).toBe(true);
  });
});

describe('backup clock skew', () => {
  it('never reports a negative age for a backup stamped in the future', () => {
    const ws = { ...createWorkspace(), lastBackupAt: '2026-10-20T00:00:00.000Z' };
    expect(daysSinceBackup(ws, new Date('2026-10-14T00:00:00.000Z'))).toBe(0);
  });
});
