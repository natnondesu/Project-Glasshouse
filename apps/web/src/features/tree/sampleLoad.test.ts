import { apply, createWorkspace, type Workspace } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { sampleCommands } from './sampleLoad';

const AT = '2026-10-17T00:00:00.000Z';

describe('sampleCommands', () => {
  it('keeps sample/load for a local workspace', () => {
    expect(sampleCommands(createWorkspace(), AT, false)).toEqual({ ok: true, value: [{ type: 'sample/load', at: AT }] });
  });

  it('builds fixed-ID imports for a server workspace that apply identically anywhere', () => {
    const cmds = sampleCommands(createWorkspace(), AT, true);
    if (!cmds.ok) throw new Error(cmds.error.message);
    expect(cmds.value.every((c) => c.type === 'project/import')).toBe(true);
    const load = (): Workspace => cmds.value.reduce((w, c) => {
      const r = apply(w, c);
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    }, createWorkspace());
    const [a, b] = [load(), load()];
    expect(a).toEqual(b);
    expect(a.projects.map((p) => p.isSample)).toEqual([true, true]);
  });
});
