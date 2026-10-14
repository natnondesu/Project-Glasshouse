import type { Id, PanelConfig, PanelPhase, PanelWay, PlanContent, RoomObject, SimpleObjectType } from './model/types';
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
const WAY_LABEL_MAX = 40;

export const defaultPanel = (): PanelConfig => ({
  phase: 'three',
  ways: Array.from({ length: DEFAULT_WAY_COUNT }, () => ({ ratingA: DEFAULT_WAY_RATING_A, label: '' })),
});

export const panelOf = (o: RoomObject): PanelConfig => (o.type !== 'rack' && o.panel ? o.panel : defaultPanel());

/** Phase of way n: L1, L2, L3 rotating on a three-phase panel; L on a single-phase one. */
export const wayPhase = (panel: PanelConfig, n: number): string => (panel.phase === 'single' ? 'L' : `L${((n - 1) % 3) + 1}`);

export type PanelCommand =
  | { type: 'panel/configure'; id: Id; patch: { phase?: PanelPhase; wayCount?: number } }
  | { type: 'panel/way'; id: Id; way: number; patch: Partial<PanelWay> };

function feedOnWay(content: PlanContent, panelId: Id, way: number): string | null {
  const feed = content.feeds.find((f) => f.sourceId === panelId && f.way === way);
  if (!feed) return null;
  return `${feed.label} of ${content.objects.find((o) => o.id === feed.rackId)?.name ?? 'a removed rack'}`;
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
    next = { phase: cmd.patch.phase ?? panel.phase, ways };
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
