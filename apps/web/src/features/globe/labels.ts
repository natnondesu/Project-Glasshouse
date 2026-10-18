import type { Size } from './camera';
import type { Marker } from './markers';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Room for a marker's name to the right of its pin before it flips to the left. */
export const LABEL_ROOM_PX = 190;
const PIN_PX = 24;
const NAME_PX = 180;
const EDGE_PX = 4;

/** The space a pin or count and its name take on screen, so nothing drawn on the map lands under them. */
export function markerBox(marker: Marker, width: number): Rect {
  const flipped = marker.x > width - LABEL_ROOM_PX;
  return { x: marker.x - PIN_PX - (flipped ? NAME_PX : 0), y: marker.y - PIN_PX, w: 2 * PIN_PX + NAME_PX, h: 2 * PIN_PX };
}

export interface PointLabel {
  /** The dot's centre on screen. */
  x: number;
  y: number;
  /** The text's size, padding for its paper halo included. */
  width: number;
  height: number;
  /** Space between the dot and the text. */
  gap: number;
}

/**
 * Where a city's or an airport's name goes: right of its dot, else left, else above, else below; the first spot inside
 * the canvas clear of names already placed and of everything to avoid (pins, their names, the map's controls, the
 * site card). Null when no spot is free: the name gives way.
 */
export function placePointLabel(label: PointLabel, placed: readonly Rect[], avoid: readonly Rect[], size: Size): Rect | null {
  const { x, y, width: w, height: h, gap } = label;
  const spots: Rect[] = [
    { x: x + gap, y: y - h / 2, w, h },
    { x: x - gap - w, y: y - h / 2, w, h },
    { x: x - w / 2, y: y - gap - h, w, h },
    { x: x - w / 2, y: y + gap, w, h },
  ];
  return (
    spots.find((r) => r.x >= EDGE_PX && r.y >= EDGE_PX && r.x + r.w <= size.width - EDGE_PX && r.y + r.h <= size.height - EDGE_PX && !placed.some((p) => intersects(p, r)) && !avoid.some((p) => intersects(p, r))) ?? null
  );
}
