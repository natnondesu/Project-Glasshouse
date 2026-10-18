import type { Panel3D } from './scene';

/** The breaker area is this share of the cabinet's face; the rest is the margin round it. */
const AREA_W = 0.84;
const AREA_H = 0.82;
const MAIN_SHARE = 0.17;
const MAIN_GAP_SHARE = 0.05;
/** A breaker fills this much of its cell, and no more than this height however few rows there are. */
const FILL = 0.86;
const MAX_BREAKER_H_M = 0.16;
/** A main breaker is wider than a way's, like the two-pole one in the photos. */
const MAIN_W_SHARE = 0.4;

export interface Breaker {
  /** Centre on the cabinet's face: x across, y up from the face's middle. */
  x: number;
  y: number;
  w: number;
  h: number;
  fed: boolean;
}

export interface BreakerLayout {
  main: Omit<Breaker, 'fed'> | null;
  ways: Breaker[];
}

/** Breaker positions on a cabinet face of `w` × `h` metres, in the arrangement the plan and the sheet use. */
export function breakerLayout(panel: Panel3D, w: number, h: number): BreakerLayout {
  const areaW = w * AREA_W;
  const areaH = h * AREA_H;
  const hasMain = panel.mainRatingA !== undefined;
  const mainH = hasMain ? areaH * MAIN_SHARE : 0;
  const gap = hasMain ? areaH * MAIN_GAP_SHARE : 0;
  const gridH = areaH - mainH - gap;
  const top = areaH / 2;
  const colW = areaW / panel.columns;
  const rowH = gridH / panel.rows;
  const bodyH = Math.min(rowH * FILL, MAX_BREAKER_H_M);
  return {
    main: hasMain ? { x: 0, y: top - mainH / 2, w: Math.min(areaW, Math.max(areaW * MAIN_W_SHARE, colW * FILL)), h: mainH } : null,
    ways: panel.cells.map((c) => ({
      x: -areaW / 2 + colW * (c.column + 0.5),
      y: top - mainH - gap - rowH * (c.row + 0.5),
      w: colW * FILL,
      h: bodyH,
      fed: c.fed,
    })),
  };
}
