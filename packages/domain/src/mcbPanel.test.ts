import { describe, expect, it } from 'vitest';
import { blockingIssues, checkPlan } from './checks';
import { applyPlanCommand, type PlanCommand } from './commands/plan';
import { createWorkspace, emptyContent } from './factories';
import { canonicalJson } from './canonical';
import { contentFingerprint } from './fingerprint';
import type { PanelConfig, PlanContent, Rack, RoomObject, Template } from './model/types';
import { createObject } from './objects';
import { approvalBlockerItems } from './readiness';
import { parseWorkspace } from './schema';
import { seedTemplates } from './catalog';
import { defaultPanel, isInUse, panelLayout, panelNumbering, panelOf, wayPosition } from './sources';
import { apply } from './commands/workspace';

function run(c: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((acc, cmd) => {
    const r = applyPlanCommand(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, c);
}
const rack = (id = 'rk', name = 'RK-01'): Rack => ({ ...(createObject('rack', { x: 2, y: 1.5 }, []) as Rack), id, name });
const mcb = (id = 'mcb', name = 'MCB-01'): RoomObject => ({ ...createObject('mcb', { x: 0, y: 1 }, []), id, name });
const server = seedTemplates().find((t) => t.id === 'tpl-server-4u') as Template;
const withWays = (n: number, extra: Partial<PanelConfig> = {}): PanelConfig => ({ ...defaultPanel(), ways: Array.from({ length: n }, () => ({ ratingA: 16, label: '' })), ...extra });

describe('panel layout helpers', () => {
  it('derives row up to 12 ways and two columns above, unless the user picked one', () => {
    expect(panelLayout(withWays(8))).toBe('row');
    expect(panelLayout(withWays(12))).toBe('row');
    expect(panelLayout(withWays(14))).toBe('two_column');
    expect(panelLayout(withWays(14, { layout: 'column' }))).toBe('column');
    expect(panelLayout(withWays(4, { layout: 'two_column' }))).toBe('two_column');
    expect(panelNumbering(withWays(14))).toBe('odd_even');
    expect(panelNumbering(withWays(14, { numbering: 'sequential' }))).toBe('sequential');
  });

  it('places ways along one row', () => {
    const p = withWays(5, { layout: 'row' });
    expect([1, 2, 5].map((n) => wayPosition(p, n))).toEqual([{ column: 0, row: 0 }, { column: 1, row: 0 }, { column: 4, row: 0 }]);
  });

  it('places ways down one column', () => {
    const p = withWays(5, { layout: 'column' });
    expect([1, 2, 5].map((n) => wayPosition(p, n))).toEqual([{ column: 0, row: 0 }, { column: 0, row: 1 }, { column: 0, row: 4 }]);
  });

  it('numbers two columns odd left, even right', () => {
    const even = withWays(14, { layout: 'two_column' });
    expect([1, 2, 3, 4, 13, 14].map((n) => wayPosition(even, n))).toEqual([
      { column: 0, row: 0 }, { column: 1, row: 0 }, { column: 0, row: 1 }, { column: 1, row: 1 }, { column: 0, row: 6 }, { column: 1, row: 6 },
    ]);
    const odd = withWays(7, { layout: 'two_column', numbering: 'odd_even' });
    expect(wayPosition(odd, 7)).toEqual({ column: 0, row: 3 });
    expect(wayPosition(odd, 6)).toEqual({ column: 1, row: 2 });
  });

  it('numbers two columns down the left, then the right', () => {
    const even = withWays(14, { layout: 'two_column', numbering: 'sequential' });
    expect([1, 2, 7, 8, 9, 14].map((n) => wayPosition(even, n))).toEqual([
      { column: 0, row: 0 }, { column: 0, row: 1 }, { column: 0, row: 6 }, { column: 1, row: 0 }, { column: 1, row: 1 }, { column: 1, row: 6 },
    ]);
    const odd = withWays(7, { layout: 'two_column', numbering: 'sequential' });
    expect([4, 5, 7].map((n) => wayPosition(odd, n))).toEqual([{ column: 0, row: 3 }, { column: 1, row: 0 }, { column: 1, row: 2 }]);
  });

  it('uses the derived layout when none is set', () => {
    expect(wayPosition(withWays(14), 2)).toEqual({ column: 1, row: 0 });
    expect(wayPosition(withWays(8), 2)).toEqual({ column: 1, row: 0 });
  });

  it('never gives two ways the same cell, in any layout', () => {
    for (const layout of ['row', 'column', 'two_column'] as const) {
      for (const numbering of ['odd_even', 'sequential'] as const) {
        for (const count of [1, 2, 7, 8, 13, 48, 72]) {
          const p = withWays(count, { layout, numbering });
          const cells = new Set(Array.from({ length: count }, (_, i) => JSON.stringify(wayPosition(p, i + 1))));
          expect(cells.size).toBe(count);
        }
      }
    }
  });
});

describe('panel/configure', () => {
  const base = () => run(emptyContent(), { type: 'object/add', object: mcb() });
  const cfg = (c: PlanContent) => panelOf(c.objects.find((o) => o.id === 'mcb')!);

  it('keeps the new fields absent until the user sets them', () => {
    const c = run(base(), { type: 'panel/configure', id: 'mcb', patch: { wayCount: 20 } });
    expect(cfg(c)).not.toHaveProperty('layout');
    expect(cfg(c)).not.toHaveProperty('numbering');
    expect(cfg(c)).not.toHaveProperty('mainRatingA');
    expect(cfg(c)).not.toHaveProperty('inUse');
  });

  it('sets layout, numbering and main rating, and keeps them through later edits', () => {
    let c = run(base(), { type: 'panel/configure', id: 'mcb', patch: { layout: 'two_column', numbering: 'sequential', mainRatingA: 100 } });
    expect(cfg(c)).toMatchObject({ layout: 'two_column', numbering: 'sequential', mainRatingA: 100 });
    c = run(c, { type: 'panel/configure', id: 'mcb', patch: { wayCount: 14 } }, { type: 'panel/way', id: 'mcb', way: 1, patch: { ratingA: 20 } });
    expect(cfg(c)).toMatchObject({ layout: 'two_column', numbering: 'sequential', mainRatingA: 100 });
    c = run(c, { type: 'panel/configure', id: 'mcb', patch: { mainRatingA: null } });
    expect(cfg(c)).not.toHaveProperty('mainRatingA');
  });

  it('marks a panel not in use and back; in use is stored as absent', () => {
    let c = run(base(), { type: 'panel/configure', id: 'mcb', patch: { inUse: false } });
    expect(isInUse(c.objects[0]!)).toBe(false);
    expect(cfg(c).inUse).toBe(false);
    c = run(c, { type: 'panel/configure', id: 'mcb', patch: { inUse: true } });
    expect(isInUse(c.objects[0]!)).toBe(true);
    expect(cfg(c)).not.toHaveProperty('inUse');
  });

  it('rejects unknown layouts, numberings and out-of-range main ratings with clear messages', () => {
    const bad = (patch: Record<string, unknown>) => applyPlanCommand(base(), { type: 'panel/configure', id: 'mcb', patch } as PlanCommand);
    expect(bad({ layout: 'grid' })).toMatchObject({ ok: false, error: { message: 'A panel layout is one row, one column or two columns.' } });
    expect(bad({ numbering: 'spiral' })).toMatchObject({ ok: false, error: { message: 'Two-column numbering is odd left and even right, or down the left then the right.' } });
    expect(bad({ mainRatingA: 0 })).toMatchObject({ ok: false, error: { message: 'A main breaker rating is more than 0 and at most 630 A.' } });
    expect(bad({ mainRatingA: 631 })).toMatchObject({ ok: false });
    expect(bad({ mainRatingA: Number.NaN })).toMatchObject({ ok: false });
    expect(bad({ mainRatingA: 630 })).toMatchObject({ ok: true });
    expect(bad({ inUse: 'no' })).toMatchObject({ ok: false });
  });
});

describe('panels that are not in use', () => {
  const base = () => run(emptyContent(), { type: 'object/add', object: rack() }, { type: 'object/add', object: mcb() }, { type: 'object/add', object: mcb('mcb2', 'MCB-02') });
  const off = (c: PlanContent) => run(c, { type: 'panel/configure', id: 'mcb2', patch: { inUse: false } });

  it('refuses new feeds and moves onto a panel not in use', () => {
    let c = off(base());
    const added = applyPlanCommand(c, { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb2', label: 'Feed A' } });
    expect(added).toMatchObject({ ok: false, error: { message: 'MCB-02 is marked not in use. Pick a panel in use, or mark it in use first.' } });
    c = run(c, { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb', label: 'Feed A' } });
    expect(applyPlanCommand(c, { type: 'feed/update', id: 'f', patch: { sourceId: 'mcb2' } })).toMatchObject({ ok: false, error: { message: 'MCB-02 is marked not in use. Pick a panel in use, or mark it in use first.' } });
  });

  it('lets a feed already wired to it be renamed, unassigned or moved away', () => {
    let c = run(base(), { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb2', label: 'Feed A' } }, { type: 'feed/update', id: 'f', patch: { way: 2 } });
    c = off(c);
    c = run(c, { type: 'feed/update', id: 'f', patch: { label: 'Feed B' } }, { type: 'feed/update', id: 'f', patch: { way: null } });
    expect(c.feeds[0]!.label).toBe('Feed B');
    expect(applyPlanCommand(c, { type: 'feed/update', id: 'f', patch: { way: 3 } })).toMatchObject({ ok: false });
    c = run(c, { type: 'feed/update', id: 'f', patch: { sourceId: 'mcb' } });
    expect(c.feeds[0]!.sourceId).toBe('mcb');
  });

  it('turning it off with feeds on it is allowed, and raises a blocking check that stops approval', () => {
    let c = run(base(), { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb2', label: 'Feed A' } }, { type: 'feed/update', id: 'f', patch: { way: 1 } });
    expect(checkPlan(c).map((i) => i.code)).not.toContain('feed_inactive_panel');
    c = off(c);
    const issue = checkPlan(c).find((i) => i.code === 'feed_inactive_panel')!;
    expect(issue).toMatchObject({
      severity: 'block',
      message: 'Feed A of RK-01 is wired to MCB-02, which is marked not in use.',
      hint: 'Move the feed to a panel in use, or mark MCB-02 in use.',
      params: { feed: 'Feed A', target: 'RK-01', source: 'MCB-02' },
      targets: ['rk', 'mcb2'],
    });
    expect(blockingIssues(checkPlan(c))).toContainEqual(issue);
    expect(checkPlan(c).map((i) => i.code)).not.toContain('feed_no_way');
    const plan = { revisions: [{ number: 1, state: 'draft', content: c, acknowledgements: [] }] } as never;
    expect(approvalBlockerItems(plan).map((b) => b.code)).toContain('feed_inactive_panel');
  });

  it('does not rate or overload-check a feed against a panel not in use', () => {
    let c = run(base(), { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb2', label: 'Feed A' } }, { type: 'feed/update', id: 'f', patch: { way: 1 } }, { type: 'panel/way', id: 'mcb2', way: 1, patch: { ratingA: 2 } }, { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: server });
    c = off(c);
    expect(checkPlan(c).map((i) => i.code)).not.toContain('feed_overload');
  });
});

describe('panel_main_overload', () => {
  const setup = (patch: { phase?: 'single' | 'three'; mainRatingA: number }, ways: number[]) => {
    let c = run(emptyContent(), { type: 'object/add', object: rack() }, { type: 'object/add', object: mcb() }, { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: server });
    c = run(c, { type: 'panel/configure', id: 'mcb', patch });
    ways.forEach((w, i) => {
      c = run(c, { type: 'feed/add', feed: { id: `f${i}`, targetId: 'rk', sourceId: 'mcb', label: `Feed ${String.fromCharCode(65 + i)}`, way: w } });
    });
    return c;
  };
  // The 4U server draws about 3.4 A at 230 V.
  it('stays quiet without a main breaker or when the load fits', () => {
    expect(checkPlan(setup({ mainRatingA: 10 }, [1, 2])).map((i) => i.code)).not.toContain('panel_main_overload');
    let c = run(emptyContent(), { type: 'object/add', object: rack() }, { type: 'object/add', object: mcb() }, { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: server });
    c = run(c, { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb', label: 'Feed A', way: 1 } });
    expect(checkPlan(c).map((i) => i.code)).not.toContain('panel_main_overload');
  });

  it('compares the busiest phase to the main on a three-phase panel', () => {
    // Ways 1 and 4 are both L1 (6.8 A); way 2 is L2 (3.4 A).
    const c = setup({ phase: 'three', mainRatingA: 5 }, [1, 4, 2]);
    const issue = checkPlan(c).find((i) => i.code === 'panel_main_overload')!;
    expect(issue).toMatchObject({ severity: 'warn', params: { source: 'MCB-01', phase: 'L1', amps: '6.8', rating: 5 }, targets: ['mcb'] });
    expect(issue.message).toBe("MCB-01's main breaker is rated 5 A, but phase L1 carries 6.8 A.");
    expect(checkPlan(setup({ phase: 'three', mainRatingA: 7 }, [1, 4, 2])).map((i) => i.code)).not.toContain('panel_main_overload');
  });

  it('compares the total to the main on a single-phase panel', () => {
    const c = setup({ phase: 'single', mainRatingA: 8 }, [1, 2, 3]);
    const issue = checkPlan(c).find((i) => i.code === 'panel_main_overload')!;
    expect(issue.message).toBe("MCB-01's main breaker is rated 8 A, but the panel carries 10.2 A.");
    expect(issue.params.phase).toBe('');
  });
});

describe('workspace files', () => {
  const workspaceWith = (content: PlanContent) => {
    let ws = createWorkspace();
    for (const cmd of [
      { type: 'project/create', id: 'p', name: 'P' },
      { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
      { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' },
    ] as const) {
      const r = apply(ws, cmd);
      if (!r.ok) throw new Error(r.error.message);
      ws = r.value;
    }
    const added = apply(ws, { type: 'plan', roomId: 'r', command: { type: 'object/add', object: content.objects[0]! } });
    if (!added.ok) throw new Error(added.error.message);
    return added.value;
  };
  const panelIn = (ws: ReturnType<typeof workspaceWith>) => {
    const r = parseWorkspace(JSON.parse(JSON.stringify(ws)));
    if (!r.ok) throw new Error(r.error.message);
    return panelOf(r.value.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!.content.objects[0]!);
  };

  it('round-trips the new panel fields', () => {
    const c = run({ ...emptyContent(), objects: [] }, { type: 'object/add', object: mcb() }, { type: 'panel/configure', id: 'mcb', patch: { wayCount: 14, layout: 'two_column', numbering: 'sequential', mainRatingA: 100, inUse: false } });
    expect(panelIn(workspaceWith(c))).toMatchObject({ layout: 'two_column', numbering: 'sequential', mainRatingA: 100, inUse: false });
  });

  it('loads an older panel without the new fields and leaves them absent', () => {
    const old: RoomObject = { ...mcb(), panel: { phase: 'three', ways: [{ ratingA: 16, label: 'x' }] } } as RoomObject;
    const p = panelIn(workspaceWith({ ...emptyContent(), objects: [old] }));
    expect(p).toEqual({ phase: 'three', ways: [{ ratingA: 16, label: 'x' }] });
  });

  const oneWay = [{ ratingA: 16, label: '' }];
  it.each([
    ['an unknown layout', { phase: 'three', ways: oneWay, layout: 'grid' }],
    ['an unknown numbering', { phase: 'three', ways: oneWay, numbering: 'spiral' }],
    ['a zero main rating', { phase: 'three', ways: oneWay, mainRatingA: 0 }],
    ['a negative main rating', { phase: 'three', ways: oneWay, mainRatingA: -5 }],
    ['a main rating above 630 A', { phase: 'three', ways: oneWay, mainRatingA: 631 }],
    ['no ways at all', { phase: 'three', ways: [] }],
  ])('rejects a file with %s', (_name, panel) => {
    const bad = { ...mcb(), panel } as unknown as RoomObject;
    const ws = workspaceWith({ ...emptyContent(), objects: [bad] });
    expect(parseWorkspace(JSON.parse(JSON.stringify(ws))).ok).toBe(false);
  });

  it('accepts a main rating of exactly 630 A', () => {
    const edge = { ...mcb(), panel: { phase: 'three', ways: oneWay, mainRatingA: 630 } } as unknown as RoomObject;
    expect(parseWorkspace(JSON.parse(JSON.stringify(workspaceWith({ ...emptyContent(), objects: [edge] })))).ok).toBe(true);
  });

  it('changes the approval fingerprint when a panel is marked not in use', () => {
    const c = run(emptyContent(), { type: 'object/add', object: mcb() });
    const off = run(c, { type: 'panel/configure', id: 'mcb', patch: { inUse: false } });
    expect(contentFingerprint(off)).not.toBe(contentFingerprint(c));
  });
});

describe('approval fingerprint of a plan saved before the new panel fields', () => {
  // A panel exactly as `main` stores it. Its canonical JSON and hash were computed on `main` and must never move,
  // or every approved revision with an MCB panel would stop matching its approved hash.
  const oldPanel = { id: 'mcb', type: 'mcb', name: 'MCB-01', x: 0, y: 1, w: 0.6, d: 0.2, angle: 0, height: null, notes: '', panel: { phase: 'three', ways: [{ ratingA: 16, label: 'CRAC' }, { ratingA: 32, label: '' }, { ratingA: 16, label: '' }] } } as unknown as RoomObject;
  const oldPlan = (): PlanContent => ({ ...emptyContent('fa'), objects: [oldPanel] });
  const OLD_FINGERPRINT = '3fa791cd465f9816dbcf90d113cfb4581d8a54ce9f788c794a92d2e5a31be2dc';
  const NEW_KEYS = ['inUse', 'layout', 'numbering', 'mainRatingA'];

  it('stays byte-for-byte what main produced', () => {
    expect(contentFingerprint(oldPlan())).toBe(OLD_FINGERPRINT);
  });

  it('adds none of the new keys when only the way count changes', () => {
    const changed = run(oldPlan(), { type: 'panel/configure', id: 'mcb', patch: { wayCount: 5 } });
    const json = canonicalJson(changed);
    for (const key of NEW_KEYS) expect(json).not.toContain(`"${key}"`);
    const back = run(changed, { type: 'panel/configure', id: 'mcb', patch: { wayCount: 3 } });
    expect(canonicalJson(back)).toBe(canonicalJson(oldPlan()));
  });
});
