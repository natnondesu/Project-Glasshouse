import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Scene3D } from './scene';
import { EYE_M, look, lookTarget, moveTo, step, type WalkCamera } from './walk';

const WALK_M_PER_S = 1.4;
const RUN_FACTOR = 2.2;
const TURN_RAD_PER_S = 1.7;
const GLIDE_M_PER_S = 2.6;
/** Trackpad scroll: pixels of two-finger scroll per metre walked. */
const SCROLL_PX_PER_M = 140;
const DRAG_SLOP_PX = 4;
const WALK_FOV_DEG = 65;

const isTextEntry = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

interface WalkControllerProps {
  scene: Scene3D;
  walk: WalkCamera;
  /** Called when movement stops, so the view keeps where you are (and a rack jump can replace it). */
  onCommit: (c: WalkCamera) => void;
  /** A point on the floor to glide to; a new object each click. */
  glide: { x: number; z: number } | null;
  onExit: () => void;
}

/**
 * First-person at eye height. Drag looks around; W/S or ↑/↓ walk, A/D step sideways, ←/→ turn, Shift
 * hurries; two-finger scroll walks too; a clicked floor point is glided to. Racks, walls and columns
 * stop you, sliding along them. The camera moves frame by frame; the view only re-renders on a stop.
 */
export function WalkController({ scene, walk, onCommit, glide, onExit }: WalkControllerProps) {
  const { camera: three, gl } = useThree();
  const cur = useRef(walk);
  const held = useRef(new Set<string>());
  const gliding = useRef<{ x: number; z: number } | null>(null);
  const moving = useRef(false);
  const latest = useRef({ onCommit, onExit, scene });
  latest.current = { onCommit, onExit, scene };

  const apply = (): void => {
    three.position.set(cur.current.x, EYE_M, cur.current.z);
    three.lookAt(...lookTarget(cur.current));
  };

  useEffect(() => {
    cur.current = walk;
    apply();
  }, [walk]);

  // Standing in the room wants a wider view than looking down on it; the overview gets its own back.
  useEffect(() => {
    if (!('fov' in three)) return;
    const persp = three as typeof three & { fov: number };
    const before = persp.fov;
    persp.fov = WALK_FOV_DEG;
    three.updateProjectionMatrix();
    return () => {
      persp.fov = before;
      three.updateProjectionMatrix();
    };
  }, [three]);

  useEffect(() => {
    gliding.current = glide;
  }, [glide]);

  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent): void => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
      drag = { x: e.clientX, y: e.clientY, moved: true };
      gliding.current = null;
      cur.current = look(cur.current, dx, dy);
      apply();
    };
    const onUp = (): void => {
      if (drag?.moved) latest.current.onCommit(cur.current);
      drag = null;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      gliding.current = null;
      cur.current = step(latest.current.scene, cur.current, -e.deltaY / SCROLL_PX_PER_M, e.deltaX / SCROLL_PX_PER_M);
      apply();
      latest.current.onCommit(cur.current);
    };
    const keys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTextEntry(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') return latest.current.onExit();
      if (!keys.includes(k)) return;
      e.preventDefault();
      held.current.add(k);
      gliding.current = null;
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      held.current.delete(e.key.toLowerCase());
    };
    const onBlur = (): void => held.current.clear();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const h = held.current;
    const scene = latest.current.scene;
    let c = cur.current;
    const speed = WALK_M_PER_S * (h.has('shift') ? RUN_FACTOR : 1) * dt;
    const ahead = (h.has('w') || h.has('arrowup') ? 1 : 0) - (h.has('s') || h.has('arrowdown') ? 1 : 0);
    const side = (h.has('d') ? 1 : 0) - (h.has('a') ? 1 : 0);
    const turn = (h.has('arrowleft') ? 1 : 0) - (h.has('arrowright') ? 1 : 0);
    if (turn) c = { ...c, heading: c.heading + turn * TURN_RAD_PER_S * dt };
    if (ahead || side) c = step(scene, c, ahead * speed, side * speed);
    const target = gliding.current;
    if (target) {
      const dx = target.x - c.x;
      const dz = target.z - c.z;
      const dist = Math.hypot(dx, dz);
      const d = Math.min(dist, GLIDE_M_PER_S * dt);
      const next = dist < 0.02 ? c : moveTo(scene, c, c.x + (dx / dist) * d, c.z + (dz / dist) * d);
      // Arrived, or blocked with nowhere to slide: stop there.
      if (dist < 0.02 || (next.x === c.x && next.z === c.z)) gliding.current = null;
      c = next;
    }
    const active = Boolean(turn || ahead || side || target);
    if (c !== cur.current) {
      cur.current = c;
      apply();
    }
    if (moving.current && !active) latest.current.onCommit(cur.current);
    moving.current = active;
  });

  return null;
}
