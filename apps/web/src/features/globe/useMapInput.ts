import type { GeoPoint } from '@glasshouse/domain';
import type { GeoProjection } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { zoomAround, type Camera, type Size } from './camera';

interface Options {
  root: React.RefObject<HTMLDivElement | null>;
  camera: Camera | null;
  size: Size | null;
  projection: GeoProjection | null;
  jumpTo: (camera: Camera) => void;
  flyTo: (camera: Camera, ms?: number) => void;
  stop: () => void;
  /** True while a flight runs: a click then is not meant for the spot under it, which is still moving. */
  flying: boolean;
  onUserMove: () => void;
  /** A click on the drawing that wasn't a drag, at that spot on the globe. */
  onTap: (point: GeoPoint) => void;
  onEnter: () => void;
  zoomMs: number;
}

/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP_PX = 4;
const KEY_PAN = 0.15;
const WHEEL_HINT_MS = 1800;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const LINE_PX = 16;

/** Wheel steps in pixels, whatever unit the browser reports (Firefox sends lines). */
export function wheelPixels(e: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, pageHeight: number): number {
  if (e.deltaMode === 1) return e.deltaY * LINE_PX;
  if (e.deltaMode === 2) return e.deltaY * pageHeight;
  return e.deltaY;
}

/** Dragging moves the globe under the pointer, like grabbing paper; near the poles longitude is kept from racing. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  const cos = Math.max(0.2, Math.cos((cam.lat * Math.PI) / 180));
  return { ...cam, lon: cam.lon - dx / (cam.ppd * cos), lat: cam.lat + dy / cam.ppd };
}

/**
 * Pointer, wheel and keys for the map. The wheel zooms only with a modifier (or a trackpad pinch) or once the map has
 * focus: Home never takes the page's scroll. Otherwise it says how, briefly, and lets the page scroll.
 */
export function useMapInput(o: Options) {
  const drag = useRef<{ id: number; x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  // A plain wheel zooms only once the map was clicked (or reached from the keyboard) and the pointer hasn't left since.
  const armed = useRef(false);
  const [wheelHint, setWheelHint] = useState(false);
  const latest = useRef(o);
  latest.current = o;

  useEffect(() => {
    const el = o.root.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disarm = (): void => {
      armed.current = false;
    };
    const armFromKeyboard = (e: FocusEvent): void => {
      if (!drag.current && (e.target as Element | null)?.matches?.(':focus-visible')) armed.current = true;
    };
    const onWheel = (e: WheelEvent): void => {
      const { camera, size, jumpTo, stop, onUserMove } = latest.current;
      if (!camera || !size) return;
      const focused = el.contains(document.activeElement) && armed.current;
      if (!(e.ctrlKey || e.metaKey || e.altKey || focused)) {
        setWheelHint(true);
        clearTimeout(timer);
        timer = setTimeout(() => setWheelHint(false), WHEEL_HINT_MS);
        return;
      }
      e.preventDefault();
      setWheelHint(false);
      stop();
      onUserMove();
      const rect = el.getBoundingClientRect();
      // A trackpad pinch sends small steps with ctrlKey; a mouse wheel sends ~100 a notch.
      const factor = Math.exp(-wheelPixels(e, size.height) * (e.ctrlKey ? 0.01 : 0.0025));
      jumpTo(zoomAround(camera, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, size));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerleave', disarm);
    el.addEventListener('focusin', armFromKeyboard);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerleave', disarm);
      el.removeEventListener('focusin', armFromKeyboard);
      clearTimeout(timer);
    };
  }, [o.root]);

  const zoom = (factor: number): void => {
    const { camera, size, flyTo, zoomMs } = latest.current;
    if (!camera || !size) return;
    flyTo(zoomAround(camera, factor, { x: size.width / 2, y: size.height / 2 }, size), zoomMs);
  };

  const point = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return {
    wheelHint,
    modifierKey: isMac ? 'Cmd' : 'Ctrl',
    zoom,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0 || !o.camera) return;
      armed.current = true;
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: o.camera, moved: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>): void => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      if (!d.moved) {
        d.moved = true;
        o.stop();
        o.onUserMove();
      }
      o.jumpTo(panBy(d.cam, dx, dy));
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>): void => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.moved || !o.projection || o.flying) return;
      const at = point(e);
      const geo = o.projection.invert?.([at.x, at.y]);
      if (geo && Number.isFinite(geo[0]) && Number.isFinite(geo[1])) o.onTap({ lon: geo[0], lat: geo[1] });
    },
    onPointerCancel: (): void => {
      drag.current = null;
    },
    onViewKeyDown: (e: React.KeyboardEvent): void => {
      const { camera, size } = o;
      if (!camera || !size) return;
      const pans: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const pan = pans[e.key];
      if (pan) {
        e.preventDefault();
        o.stop();
        o.onUserMove();
        o.jumpTo(panBy(camera, pan[0] * size.width * KEY_PAN, pan[1] * size.height * KEY_PAN));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoom(2);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoom(0.5);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        o.onEnter();
      }
    },

  };
}
