import { footprintOf } from './footprint';
import { centerOf, localToWorld, type Point, type Ring } from './geometry/polygon';
import type { Id, PlanContent, PowerFeed } from './model/types';
import { err, ok, type Result } from './result';
import { isPowerSource, panelOf, WALL_MOUNTED_SOURCES } from './sources';

export const MAX_FEEDS_PER_RACK = 8;
const LABEL_MAX = 24;
/** Distance a run sits inside the wall, and the spacing between parallel runs. */
const WALL_INSET_M = 0.12;
const LANE_M = 0.07;
const LANES = 5;
const ENTRY_SPACING_M = 0.15;

export function nextFeedLabel(content: PlanContent, rackId: Id): string {
  const used = new Set(content.feeds.filter((f) => f.rackId === rackId).map((f) => f.label));
  for (let i = 0; i < 26; i += 1) {
    const label = `Feed ${String.fromCharCode(65 + i)}`;
    if (!used.has(label)) return label;
  }
  return `Feed ${used.size + 1}`;
}

export const usesFeedObject = (feed: PowerFeed, objectId: Id): boolean => feed.rackId === objectId || feed.sourceId === objectId;

export type FeedCommand =
  | { type: 'feed/add'; feed: PowerFeed }
  | { type: 'feed/update'; id: Id; patch: { label?: string; sourceId?: Id; way?: number | null } }
  | { type: 'feed/remove'; id: Id };

function validate(content: PlanContent, feed: PowerFeed): Result<PowerFeed> {
  const rack = content.objects.find((o) => o.id === feed.rackId);
  const source = content.objects.find((o) => o.id === feed.sourceId);
  if (!rack || !source) return err('not_found', 'That object no longer exists.', [feed.rackId, feed.sourceId]);
  if (rack.type !== 'rack' || !isPowerSource(source)) return err('invalid_value', 'Power feeds run from a power source to a rack.', [feed.rackId, feed.sourceId]);
  const label = feed.label.trim();
  if (label.length === 0 || label.length > LABEL_MAX) return err('invalid_value', `Feed names are 1 to ${LABEL_MAX} characters.`, [feed.id]);
  if (feed.way !== undefined) {
    if (source.type !== 'mcb') return err('invalid_value', 'Only MCB panels have ways.', [feed.id]);
    const ways = panelOf(source).ways.length;
    if (!Number.isInteger(feed.way) || feed.way < 1 || feed.way > ways) return err('invalid_value', `${source.name} has ways 1 to ${ways}.`, [feed.id]);
    const taken = content.feeds.find((f) => f.id !== feed.id && f.sourceId === source.id && f.way === feed.way);
    if (taken) {
      const owner = content.objects.find((o) => o.id === taken.rackId)?.name ?? 'a removed rack';
      return err('invalid_value', `Way ${feed.way} on ${source.name} already has ${taken.label} of ${owner}.`, [feed.id]);
    }
  }
  return ok({ ...feed, label });
}

export function applyFeedCommand(content: PlanContent, cmd: FeedCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'feed/add': {
      if (content.feeds.some((f) => f.id === cmd.feed.id)) return err('invalid_value', 'That ID is already in use.', [cmd.feed.id]);
      if (content.feeds.filter((f) => f.rackId === cmd.feed.rackId).length >= MAX_FEEDS_PER_RACK) {
        return err('invalid_value', `A rack can have up to ${MAX_FEEDS_PER_RACK} power feeds.`, [cmd.feed.rackId]);
      }
      const valid = validate(content, cmd.feed);
      return valid.ok ? ok({ ...content, feeds: [...content.feeds, valid.value] }) : valid;
    }
    case 'feed/update': {
      const current = content.feeds.find((f) => f.id === cmd.id);
      if (!current) return err('not_found', 'That power feed no longer exists.', [cmd.id]);
      const { way, ...rest } = cmd.patch;
      const merged: PowerFeed = { ...current, ...rest };
      // Moving to another source drops the way; `way: null` clears it explicitly.
      const nextWay = way === null || (rest.sourceId !== undefined && rest.sourceId !== current.sourceId && way === undefined) ? undefined : (way ?? current.way);
      const { way: _old, ...withoutWay } = merged;
      const valid = validate(content, nextWay === undefined ? withoutWay : { ...withoutWay, way: nextWay });
      return valid.ok ? ok({ ...content, feeds: content.feeds.map((f) => (f.id === cmd.id ? valid.value : f)) }) : valid;
    }
    case 'feed/remove':
      if (!content.feeds.some((f) => f.id === cmd.id)) return err('not_found', 'That power feed no longer exists.', [cmd.id]);
      return ok({ ...content, feeds: content.feeds.filter((f) => f.id !== cmd.id) });
  }
}

interface OnRing {
  point: Point;
  edge: number;
  /** Distance along the ring from its first vertex. */
  s: number;
}

function closestOnRing(ring: Ring, p: Point): OnRing & { distance: number } {
  let best: OnRing & { distance: number } = { point: ring[0]!, edge: 0, s: 0, distance: Infinity };
  let s0 = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len)));
    const q: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.distance) best = { point: q, edge: i, s: s0 + t * len, distance: d };
    s0 += len;
  }
  return best;
}

const signedArea = (ring: Ring): number => ring.slice(0, -1).reduce((sum, [x1, y1], i) => sum + x1 * ring[i + 1]![1] - ring[i + 1]![0] * y1, 0) / 2;

/** Unit normal of edge i pointing into the room. */
function inward(ring: Ring, i: number): Point {
  const n = ring.length - 1;
  const a = ring[((i % n) + n) % n]!;
  const b = ring[((i % n) + n) % n + 1]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const left: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  return signedArea(ring) > 0 ? left : [-left[0], -left[1]];
}

/** Offsets a ring vertex into the room, mitred so both walls stay `k` away. */
function insetVertex(ring: Ring, i: number, k: number): Point {
  const n1 = inward(ring, i - 1);
  const n2 = inward(ring, i);
  const mx = n1[0] + n2[0];
  const my = n1[1] + n2[1];
  const dot = 1 + n1[0] * n2[0] + n1[1] * n2[1];
  const v = ring[i]!;
  return dot < 1e-6 ? [v[0] + n2[0] * k, v[1] + n2[1] * k] : [v[0] + (mx * k) / dot, v[1] + (my * k) / dot];
}

const insetOnEdge = (ring: Ring, at: OnRing, k: number): Point => {
  const n = inward(ring, at.edge);
  return [at.point[0] + n[0] * k, at.point[1] + n[1] * k];
};

/** Ring vertex indices from `from` to `to` inclusive, stepping by ±1 and wrapping. */
function walk(n: number, from: number, to: number, step: 1 | -1): number[] {
  const out: number[] = [];
  const wrap = (i: number): number => ((i % n) + n) % n;
  for (let i = wrap(from), guard = 0; guard < n; i = wrap(i + step), guard += 1) {
    out.push(i);
    if (i === wrap(to)) break;
  }
  return out;
}

/**
 * The run of a feed on the floor plan: from the panel, along the walls just inside the room
 * (the shorter way round), then straight across to the rear of the rack. Each feed gets its own lane.
 * Null when either end is gone.
 */
export function feedRoute(content: PlanContent, feed: PowerFeed): Point[] | null {
  const source = content.objects.find((o) => o.id === feed.sourceId);
  const rack = content.objects.find((o) => o.id === feed.rackId);
  if (!source || !rack) return null;
  const from = centerOf(source);
  // Several feeds enter the rear side by side, like separate cable entries.
  const siblings = content.feeds.filter((f) => f.rackId === rack.id);
  const slot = siblings.indexOf(feed) - (siblings.length - 1) / 2;
  const to = localToWorld(rack, [slot * Math.min(ENTRY_SPACING_M, rack.w / (siblings.length + 1)), -rack.d / 2]);
  // Floor-standing sources (UPS, PDU, floor box) run straight across the floor in an L.
  if (source.type === 'rack' || !WALL_MOUNTED_SOURCES.has(source.type)) return [from, [to[0], from[1]], to];
  const rings = footprintOf(content.survey).map((poly) => poly[0]!).filter((r) => r.length > 3);
  if (rings.length === 0) return [from, to];
  const ring = rings.map((r) => ({ r, at: closestOnRing(r, from) })).sort((x, y) => x.at.distance - y.at.distance)[0]!.r;
  const start = closestOnRing(ring, from);
  const end = closestOnRing(ring, to);
  const k = WALL_INSET_M + (content.feeds.indexOf(feed) % LANES) * LANE_M;
  const perimeter = ring.slice(0, -1).reduce((sum, a, i) => sum + Math.hypot(ring[i + 1]![0] - a[0], ring[i + 1]![1] - a[1]), 0);
  const forward = (((end.s - start.s) % perimeter) + perimeter) % perimeter;
  const n = ring.length - 1;
  const sameEdge = start.edge === end.edge;
  const corners =
    forward <= perimeter / 2
      ? sameEdge && end.s >= start.s
        ? []
        : walk(n, start.edge + 1, end.edge, 1)
      : sameEdge && end.s <= start.s
        ? []
        : walk(n, start.edge, end.edge + 1, -1);
  const vertices = corners.map((i) => insetVertex(ring, i, k));
  return [from, insetOnEdge(ring, start, k), ...vertices, insetOnEdge(ring, end, k), to];
}
