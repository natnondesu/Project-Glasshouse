import type { Rect } from './labels';

const CONTROLS = '.globe-crumbs, .globe-zoom, .globe-spin, .globe-map__foot, .globe-place, .globe-map__empty, .globe-matches, .globe-sitecard, .globe-notplaced';
const CONTROL_PAD_PX = 6;
const MARKER_PAD_PX = 4;

/**
 * What names drawn on the map keep clear of, in the map's coordinates: its own controls and whatever floats over it
 * (the site card, Not placed yet), found in the hero; with `markers`, each pin and its name as actually drawn.
 */
export function overlayBoxes(root: HTMLElement | null, { controls = true, markers = false }: { controls?: boolean; markers?: boolean } = {}): Rect[] {
  if (!root) return [];
  const base = root.getBoundingClientRect();
  const frame = root.closest('.globe-hero__paper') ?? root;
  const local = (r: DOMRect, pad: number): Rect => ({ x: r.left - base.left - pad, y: r.top - base.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad });
  const out: Rect[] = controls ? [...frame.querySelectorAll<HTMLElement>(CONTROLS)].map((el) => local(el.getBoundingClientRect(), CONTROL_PAD_PX)) : [];
  if (!markers) return out;
  for (const li of root.querySelectorAll<HTMLElement>('.globe-marker')) {
    const parts = [...li.children].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (parts.length === 0) continue;
    const left = Math.min(...parts.map((r) => r.left));
    const top = Math.min(...parts.map((r) => r.top));
    const right = Math.max(...parts.map((r) => r.right));
    const bottom = Math.max(...parts.map((r) => r.bottom));
    out.push(local(new DOMRect(left, top, right - left, bottom - top), MARKER_PAD_PX));
  }
  return out;
}
