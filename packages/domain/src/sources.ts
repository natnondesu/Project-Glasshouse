import type { Id, PanelConfig, PanelLayout, PanelPhase, PanelWay, PlanContent, RoomObject, SimpleObjectType, WayNumbering } from './model/types';
import { err, ok, type Result } from './result';

/** Everything a rack feed can come from. */
export const POWER_SOURCE_TYPES: ReadonlySet<SimpleObjectType> = new Set(['mcb', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu']);
/** Mounted on a wall: feeds drop down the wall and follow it. Others stand on (or in) the floor. */
export const WALL_MOUNTED_SOURCES: ReadonlySet<SimpleObjectType> = new Set(['mcb', 'wall_plug', 'industrial_socket']);
/** Flush with the wall or floor: they never obstruct racks or their clearance. */
export const FLUSH_TYPES: ReadonlySet<SimpleObjectType> = new Set(['wall_plug', 'industrial_socket', 'floor_box']);

export const isPowerSource = (o: RoomObject): boolean => o.type !== 'rack' && POWER_SOURCE_TYPES.has(o.type);
export const isFlush = (o: RoomObject): boolean => o.type !== 'rack' && FLUSH_TYPES.has(o.type);

/** Single-phase line voltage used to turn watts into amps (Thailand and most of Asia). */
export const NOMINAL_VOLTAGE_V = 230;
export const DEFAULT_WAY_RATING_A = 16;
export const DEFAULT_WAY_COUNT = 12;
export const MAX_WAYS = 72;
const MAX_RATING_A = 250;
export const MAX_MAIN_RATING_A = 630;
/** Up to this many ways a panel is a single row of breakers; above it, two columns. */
export const ROW_LAYOUT_MAX_WAYS = 12;
export const PANEL_LAYOUTS: readonly PanelLayout[] = ['row', 'column', 'two_column'];
export const WAY_NUMBERINGS: readonly WayNumbering[] = ['odd_even', 'sequential'];
const WAY_LABEL_MAX = 40;

export const defaultPanel = (): PanelConfig => ({
  phase: 'three',
  ways: Array.from({ length: DEFAULT_WAY_COUNT }, () => ({ ratingA: DEFAULT_WAY_RATING_A, label: '' })),
});

export const panelOf = (o: RoomObject): PanelConfig => (o.type !== 'rack' && o.panel ? o.panel : defaultPanel());

/** False only for an MCB panel marked not in use; every other object counts as in use. */
export const isInUse = (o: RoomObject): boolean => o.type !== 'mcb' || o.panel?.inUse !== false;

/** The arrangement of breakers on the panel face; derived from the way count until the user picks one. */
export const panelLayout = (panel: PanelConfig): PanelLayout => panel.layout ?? (panel.ways.length <= ROW_LAYOUT_MAX_WAYS ? 'row' : 'two_column');
export const panelNumbering = (panel: PanelConfig): WayNumbering => panel.numbering ?? 'odd_even';

/** Where way n (1-based) sits on the panel face, 0-based from the top-left. Every renderer uses this so they agree. */
export function wayPosition(panel: PanelConfig, n: number): { column: number; row: number } {
  const i = n - 1;
  switch (panelLayout(panel)) {
    case 'row':
      return { column: i, row: 0 };
    case 'column':
      return { column: 0, row: i };
    case 'two_column': {
      if (panelNumbering(panel) === 'odd_even') return { column: i % 2, row: Math.floor(i / 2) };
      const left = Math.ceil(panel.ways.length / 2);
      return i < left ? { column: 0, row: i } : { column: 1, row: i - left };
    }
  }
}

/** Phase of way n: L1, L2, L3 rotating on a three-phase panel; L on a single-phase one. */
export const wayPhase = (panel: PanelConfig, n: number): string => (panel.phase === 'single' ? 'L' : `L${((n - 1) % 3) + 1}`);

export interface PanelPatch {
  phase?: PanelPhase;
  wayCount?: number;
  inUse?: boolean;
  layout?: PanelLayout;
  numbering?: WayNumbering;
  /** `null` clears the main breaker. */
  mainRatingA?: number | null;
}

export type PanelCommand =
  | { type: 'panel/configure'; id: Id; patch: PanelPatch }
  | { type: 'panel/way'; id: Id; way: number; patch: Partial<PanelWay> };

function feedOnWay(content: PlanContent, panelId: Id, way: number): string | null {
  const feed = content.feeds.find((f) => f.sourceId === panelId && f.way === way);
  if (!feed) return null;
  return `${feed.label} of ${content.objects.find((o) => o.id === feed.targetId)?.name ?? 'a removed rack'}`;
}

function invalidPatch({ inUse, layout, numbering, mainRatingA }: PanelPatch): string | null {
  if (inUse !== undefined && typeof inUse !== 'boolean') return 'A panel is either in use or not.';
  if (layout !== undefined && !PANEL_LAYOUTS.includes(layout)) return 'A panel layout is one row, one column or two columns.';
  if (numbering !== undefined && !WAY_NUMBERINGS.includes(numbering)) return 'Two-column numbering is odd left and even right, or down the left then the right.';
  if (mainRatingA !== undefined && mainRatingA !== null && !(Number.isFinite(mainRatingA) && mainRatingA > 0 && mainRatingA <= MAX_MAIN_RATING_A)) {
    return `A main breaker rating is more than 0 and at most ${MAX_MAIN_RATING_A} A.`;
  }
  return null;
}

/** Absent means the default (in use, derived layout, no main), so clearing a field removes the key rather than writing the default. */
function applyPatch(panel: PanelConfig, patch: PanelPatch): PanelConfig {
  const { inUse: wasInUse, mainRatingA: wasMain, ...rest } = panel;
  const inUse = patch.inUse ?? wasInUse;
  const main = patch.mainRatingA === undefined ? wasMain : (patch.mainRatingA ?? undefined);
  return {
    ...rest,
    ...(patch.layout ? { layout: patch.layout } : {}),
    ...(patch.numbering ? { numbering: patch.numbering } : {}),
    ...(inUse === false ? { inUse } : {}),
    ...(main !== undefined ? { mainRatingA: main } : {}),
  };
}

export function applyPanelCommand(content: PlanContent, cmd: PanelCommand): Result<PlanContent> {
  const target = content.objects.find((o) => o.id === cmd.id);
  if (!target) return err('not_found', 'That object no longer exists.', [cmd.id]);
  if (target.type !== 'mcb') return err('invalid_value', `${target.name} is not an MCB panel.`, [cmd.id]);
  const panel = panelOf(target);
  let next: PanelConfig;
  if (cmd.type === 'panel/configure') {
    const count = cmd.patch.wayCount ?? panel.ways.length;
    if (!Number.isInteger(count) || count < 1 || count > MAX_WAYS) return err('invalid_value', `A panel has 1 to ${MAX_WAYS} ways.`, [cmd.id]);
    for (let n = count + 1; n <= panel.ways.length; n += 1) {
      const used = feedOnWay(content, target.id, n);
      if (used) return err('invalid_value', `Way ${n} has ${used}. Move it before removing ways.`, [cmd.id]);
    }
    const ways = Array.from({ length: count }, (_, i) => panel.ways[i] ?? { ratingA: DEFAULT_WAY_RATING_A, label: '' });
    const invalid = invalidPatch(cmd.patch);
    if (invalid) return err('invalid_value', invalid, [cmd.id]);
    next = applyPatch({ ...panel, phase: cmd.patch.phase ?? panel.phase, ways }, cmd.patch);
  } else {
    const current = panel.ways[cmd.way - 1];
    if (!current) return err('invalid_value', `${target.name} has ways 1 to ${panel.ways.length}.`, [cmd.id]);
    const way = { ...current, ...cmd.patch };
    if (!Number.isFinite(way.ratingA) || way.ratingA <= 0 || way.ratingA > MAX_RATING_A) return err('invalid_value', `A breaker rating is more than 0 and at most ${MAX_RATING_A} A.`, [cmd.id]);
    if (way.label.length > WAY_LABEL_MAX) return err('invalid_value', `Way labels are at most ${WAY_LABEL_MAX} characters.`, [cmd.id]);
    next = { ...panel, ways: panel.ways.map((w, i) => (i === cmd.way - 1 ? way : w)) };
  }
  return ok({ ...content, objects: content.objects.map((o) => (o.id === target.id && o.type === 'mcb' ? { ...o, panel: next } : o)) });
}

/** Current a rack draws at the nominal voltage, from its known demand. Each feed is sized to carry all of it. */
export function rackCurrentA(rack: RoomObject): number {
  if (rack.type !== 'rack') return 0;
  const w = rack.devices.reduce((sum, d) => sum + (d.demand.kind === 'known' ? d.demand.watts : 0) + (d.kind === 'chassis' ? d.nodes.reduce((n, x) => n + (x.demand.kind === 'known' ? x.demand.watts : 0), 0) : 0), 0);
  const reserved = rack.reserved.reduce((sum, r) => sum + (r.demand.kind === 'known' ? r.demand.watts : 0), 0);
  return (w + reserved) / NOMINAL_VOLTAGE_V;
}
