import { LIMITS } from './model/defaults';
import type { Demand, Watts } from './model/types';

export const known = (watts: Watts): Demand => ({ kind: 'known', watts });
export const unknownDemand = (): Demand => ({ kind: 'unknown' });

export interface DemandTotal {
  knownW: Watts;
  unknownCount: number;
}

export const ZERO_TOTAL: DemandTotal = { knownW: 0, unknownCount: 0 };

export const sumDemand = (demands: Demand[]): DemandTotal =>
  demands.reduce<DemandTotal>(
    (t, d) => (d.kind === 'known' ? { knownW: t.knownW + d.watts, unknownCount: t.unknownCount } : { knownW: t.knownW, unknownCount: t.unknownCount + 1 }),
    ZERO_TOTAL,
  );

export const formatWatts = (w: Watts): string => `${Math.round(w).toLocaleString('en-US')} W`;

export const formatDemand = (d: Demand): string => (d.kind === 'known' ? formatWatts(d.watts) : 'unknown');

export function validateDemand(d: Demand): string | null {
  if (d.kind === 'unknown') return null;
  if (!Number.isFinite(d.watts) || d.watts < 0 || d.watts > LIMITS.deviceDemandMaxW) return 'Demand must be between 0 and 20,000 W.';
  return null;
}
