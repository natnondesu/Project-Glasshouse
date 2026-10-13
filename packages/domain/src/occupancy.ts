import type { Id, Rack, Units } from './model/types';
import { err, type Failure } from './result';

export interface USpan {
  id: Id;
  label: string;
  bottomU: Units;
  heightU: Units;
}

export const topU = (s: Pick<USpan, 'bottomU' | 'heightU'>): Units => s.bottomU + s.heightU - 1;

export const formatURange = (s: Pick<USpan, 'bottomU' | 'heightU'>): string =>
  s.heightU <= 1 ? `U${s.bottomU}` : `U${s.bottomU}–U${topU(s)}`;

export function rackSpans(rack: Rack): USpan[] {
  return [
    ...rack.devices.map((d) => ({ id: d.id, label: d.name, bottomU: d.bottomU, heightU: d.heightU })),
    ...rack.reserved.map((r) => ({ id: r.id, label: r.label, bottomU: r.bottomU, heightU: r.heightU })),
  ].sort((a, b) => a.bottomU - b.bottomU);
}

export const usedU = (rack: Rack): Units => rackSpans(rack).reduce((n, s) => n + s.heightU, 0);

const spansOverlap = (a: Pick<USpan, 'bottomU' | 'heightU'>, b: Pick<USpan, 'bottomU' | 'heightU'>): boolean =>
  a.bottomU <= topU(b) && b.bottomU <= topU(a);

/** Hard rule for every Rack device and Reserved range; a span with the same id is the thing being moved. */
export function checkSpan(rack: Rack, span: USpan): Failure | null {
  if (!Number.isInteger(span.bottomU) || span.bottomU < 1 || !Number.isInteger(span.heightU) || span.heightU < 1) {
    return err('invalid_value', 'Positions are whole U, starting at U1.', [span.id]);
  }
  if (topU(span) > rack.capacityU) {
    return err('out_of_bounds', `${span.label} needs ${formatURange(span)}, but ${rack.name} has ${rack.capacityU}U.`, [span.id]);
  }
  const clash = rackSpans(rack).find((s) => s.id !== span.id && spansOverlap(s, span));
  if (clash) {
    return err('invalid_value', `${span.label} would overlap ${clash.label} at U${Math.max(span.bottomU, clash.bottomU)}.`, [span.id, clash.id]);
  }
  return null;
}

export function lowestFreeBottomU(rack: Rack, heightU: Units): Units | null {
  const spans = rackSpans(rack);
  for (let u = 1; u + heightU - 1 <= rack.capacityU; u += 1) {
    if (!spans.some((s) => spansOverlap(s, { bottomU: u, heightU }))) return u;
  }
  return null;
}
