import { applyPlanCommand, findRackDevice, racksOf, type Id, type PlanContent } from '@glasshouse/domain';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface DropPreview {
  deviceId: Id;
  rackId: Id;
  bottomU: number;
  heightU: number;
  ok: boolean;
  /** The domain's own refusal, shown beside the ghost. */
  reason: string | null;
  unchanged: boolean;
}

/**
 * Where a dragged device would land with the pointer over `pointerU` of `rackId`, holding it
 * `grabOffsetU` units above its bottom. Validity comes from the real move command, so the ghost
 * and the drop always agree (overlap, depth, capacity).
 */
export function dropPreview(content: PlanContent, deviceId: Id, rackId: Id, pointerU: number, grabOffsetU: number): DropPreview | null {
  const from = findRackDevice(content, deviceId);
  const rack = racksOf(content).find((r) => r.id === rackId);
  if (!from || !rack) return null;
  const heightU = from.device.heightU;
  const bottomU = Math.max(1, Math.min(pointerU - grabOffsetU, rack.capacityU - heightU + 1));
  const unchanged = rackId === from.rack.id && bottomU === from.device.bottomU;
  if (unchanged) return { deviceId, rackId, bottomU, heightU, ok: true, reason: null, unchanged };
  const result = applyPlanCommand(content, { type: 'device/move', id: deviceId, rackId, bottomU });
  return { deviceId, rackId, bottomU, heightU, ok: result.ok, reason: result.ok ? null : result.error.message, unchanged };
}

/** Pixels the pointer must travel before a press becomes a drag, so a click still selects. */
const DRAG_SLOP_PX = 4;
/** Near the scroll area's top or bottom edge, a drag scrolls it so off-screen U positions are reachable. */
const EDGE_SCROLL_PX = 48;
const EDGE_STEP_PX = 14;

function edgeScroll(el: HTMLElement | null, y: number): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (y < r.top + EDGE_SCROLL_PX) el.scrollBy(0, -EDGE_STEP_PX);
  else if (y > r.bottom - EDGE_SCROLL_PX) el.scrollBy(0, EDGE_STEP_PX);
}

interface Grab {
  deviceId: Id;
  grabOffsetU: number;
  x: number;
  y: number;
  dragging: boolean;
}

export interface RackHit {
  rackId: Id;
  pointerU: number;
}

/**
 * Pointer-driven drag for rack devices. `hitTest` maps a client point to the rack and U under it
 * (the elevation owns the SVG geometry). Escape cancels.
 */
export function useDeviceDrag(opts: {
  content: PlanContent;
  disabled: boolean;
  hitTest: (x: number, y: number) => RackHit | null;
  onDrop: (preview: DropPreview) => void;
  scrollArea?: () => HTMLElement | null;
}) {
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const grab = useRef<Grab | null>(null);
  const latest = useRef(opts);
  latest.current = opts;
  const previewRef = useRef<DropPreview | null>(null);
  const show = (p: DropPreview | null): void => {
    previewRef.current = p;
    setPreview(p);
  };

  const end = useCallback((commit: boolean) => {
    const g = grab.current;
    grab.current = null;
    const p = previewRef.current;
    show(null);
    document.body.classList.remove('is-dragging-device');
    if (commit && g?.dragging && p && !p.unchanged) latest.current.onDrop(p);
  }, []);

  useEffect(() => {
    const previewAt = (g: Grab, x: number, y: number): DropPreview | null => {
      const hit = latest.current.hitTest(x, y);
      return hit ? dropPreview(latest.current.content, g.deviceId, hit.rackId, hit.pointerU, g.grabOffsetU) : null;
    };
    const move = (e: PointerEvent): void => {
      const g = grab.current;
      if (!g) return;
      if (!g.dragging) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_SLOP_PX) return;
        g.dragging = true;
        document.body.classList.add('is-dragging-device');
      }
      edgeScroll(latest.current.scrollArea?.() ?? null, e.clientY);
      const next = previewAt(g, e.clientX, e.clientY);
      const p = previewRef.current;
      if (next?.rackId !== p?.rackId || next?.bottomU !== p?.bottomU || (next === null) !== (p === null)) show(next);
    };
    // Browsers merge pointer moves into frames, so a quick release can land where no move was seen:
    // drop where the pointer is released, not where the last move left the preview.
    const up = (e: PointerEvent): void => {
      const g = grab.current;
      if (g?.dragging) show(previewAt(g, e.clientX, e.clientY));
      end(true);
    };
    // The browser took the gesture over (a scroll, a system dialog): nothing should move.
    const cancel = (): void => end(false);
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && grab.current) end(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [end]);

  const start = useCallback((e: ReactPointerEvent, deviceId: Id, bottomU: number) => {
    if (latest.current.disabled || e.button !== 0) return;
    const hit = latest.current.hitTest(e.clientX, e.clientY);
    if (!hit) return;
    grab.current = { deviceId, grabOffsetU: hit.pointerU - bottomU, x: e.clientX, y: e.clientY, dragging: false };
  }, []);

  return { preview, start };
}
