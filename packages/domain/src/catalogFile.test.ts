import { describe, expect, it } from 'vitest';
import { seedTemplates, SEED_TEMPLATE_IDS } from './catalog';
import { exportCatalog, parseCatalogFile, previewCatalogImport } from './catalogFile';
import { applyCatalogCommand } from './commands/catalog';
import defaultCatalog from './default-catalog.json';

const AT = '2026-10-15T00:00:00.000Z';

describe('catalog file', () => {
  it('round-trips the catalog', () => {
    const file = exportCatalog(seedTemplates(), AT);
    expect(file).toMatchObject({ format: 'glasshouse.catalog', exportedAt: AT });
    const parsed = parseCatalogFile(JSON.parse(JSON.stringify(file)));
    expect(parsed.ok && parsed.value).toEqual(seedTemplates());
  });

  it('refuses files that are not a catalog, or hold invalid templates', () => {
    expect(parseCatalogFile({ hello: 1 })).toMatchObject({ ok: false, error: { message: "This isn't a Glasshouse catalog file." } });
    const bad = exportCatalog([{ ...seedTemplates()[0]!, label: '' }], AT);
    expect(parseCatalogFile(bad)).toMatchObject({ ok: false });
    const dupes = exportCatalog([seedTemplates()[0]!, seedTemplates()[0]!], AT);
    expect(parseCatalogFile(dupes)).toMatchObject({ ok: false, error: { message: 'The catalog file lists tpl-switch-1u twice.' } });
  });

  it('imports by ID: adds new templates, updates changed ones as a new version, leaves the rest', () => {
    const local = seedTemplates();
    const incoming = [
      { ...local[0]!, label: 'Core switch 48p', illustrative: false },
      local[1]!,
      { ...local[1]!, id: 'tpl-ups-3u', label: 'UPS 3U', category: 'power' as const, heightU: 3 },
    ];
    expect(previewCatalogImport(local, incoming)).toEqual({ added: ['UPS 3U'], updated: ['Core switch 48p'], unchanged: 1 });
    const r = applyCatalogCommand(local, { type: 'catalog/import', templates: incoming });
    if (!r.ok) throw new Error(r.error.message);
    const sw = r.value.find((t) => t.id === 'tpl-switch-1u')!;
    expect(sw).toMatchObject({ label: 'Core switch 48p', version: local[0]!.version + 1 });
    expect(r.value.find((t) => t.id === 'tpl-server-1u')).toEqual(local[1]);
    expect(r.value.map((t) => t.id)).toContain('tpl-ups-3u');
    expect(r.value).toHaveLength(local.length + 1);
  });

  it('ships a valid default catalog file that new workspaces start from', () => {
    const parsed = parseCatalogFile(defaultCatalog);
    expect(parsed.ok && parsed.value.map((t) => t.id)).toEqual(SEED_TEMPLATE_IDS);
  });
});
