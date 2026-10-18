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
/** Where a marker's name starts, from the pin's centre (MapMarkers' label offset). */
const LABEL_OFFSET_PX = 20;
const NAME_PAD_PX = 2;
/** A name's width guessed from its length, for when nothing drawn can be measured (13 px semibold). */
const CHAR_PX = 7.5;
const MAX_GUESS_PX = 220;
const EDGE_PX = 4;

/**
 * The space a pin or count and its name take on screen, so nothing drawn on the map lands under them. `label` is the
 * name's drawn size when known; otherwise it is guessed from the name's length.
 */
export function markerBox(marker: Marker, width: number, label?: { w: number; h: number }): Rect {
  const flipped = marker.x > width - LABEL_ROOM_PX;
  const name = marker.kind === 'site' ? marker.site.name : (marker.place ?? '');
  const w = label?.w ?? Math.min(MAX_GUESS_PX, name.length * CHAR_PX + 12);
  const h = Math.max(PIN_PX, label?.h ?? 32);
  const reach = LABEL_OFFSET_PX + w + NAME_PAD_PX;
  const pin = PIN_PX / 2 + NAME_PAD_PX;
  return flipped ? { x: marker.x - reach, y: marker.y - h / 2, w: reach + pin, h } : { x: marker.x - pin, y: marker.y - h / 2, w: pin + reach, h };
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
