import { describe, expect, it } from 'vitest';
import { seedTemplates, validateTemplate } from './catalog';
import { exportCatalog, parseCatalogFile } from './catalogFile';
import { migrate } from './migrations';

describe('Server category (Compute and Storage merged)', () => {
  it('upgrades schema 7: catalog templates, templates used and placed devices become Server', () => {
    const tpl = (category: string) => ({ id: `t-${category}`, category });
    const m = migrate({
      schemaVersion: 7,
      lastBackupAt: null,
      catalog: [tpl('compute'), tpl('storage'), tpl('network')],
      projects: [{ sites: [{ rooms: [{ plan: { revisions: [{ content: {
        templatesUsed: [tpl('storage')],
        objects: [{ type: 'rack', devices: [{ kind: 'device', category: 'compute' }, { kind: 'device', category: 'storage' }, { kind: 'chassis', nodes: [] }] }, { type: 'door' }],
      } }] } }] }] }],
    });
    if (!m.ok) throw new Error(m.error.message);
    const json = JSON.stringify(m.value);
    expect(json).not.toMatch(/"compute"|"storage"/);
    expect((m.value as { schemaVersion: number }).schemaVersion).toBe(9);
    expect(json.match(/"server"/g)).toHaveLength(5);
    expect(json).toContain('"network"');
  });

  it('reads catalog files exported before the merge', () => {
    const old = exportCatalog(seedTemplates(), '2026-10-01T00:00:00.000Z') as unknown as { schemaVersion: number; templates: { category: string }[] };
    old.schemaVersion = 7;
    old.templates = old.templates.map((t, i) => (t.category === 'server' ? { ...t, category: i % 2 ? 'compute' : 'storage' } : t));
    const parsed = parseCatalogFile(JSON.parse(JSON.stringify(old)));
    expect(parsed.ok && parsed.value.map((t) => t.category)).toEqual(seedTemplates().map((t) => t.category));
  });

  it('gives Nodes the Server category', () => {
    const node = seedTemplates().find((t) => t.mounting === 'slot')!;
    expect(node.category).toBe('server');
    expect(validateTemplate({ ...node, category: 'network' })).toMatchObject({ ok: false, error: { message: 'Nodes use the Server category.' } });
  });
});
