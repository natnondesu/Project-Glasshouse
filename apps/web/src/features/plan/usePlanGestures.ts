import { createObject, newId, snapDrag, snapFloor, type Id, type PlanCommand, type PlanContent, type Point } from '@glasshouse/domain';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { hitTest } from './hitTest';
import type { Preview } from './layers';
import type { SvgHandlers } from './PlanCanvas';
import { resizePlacement, type Handle } from './resize';
import { isPlacementTool, toolForKey, type Tool } from './tools';

export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move'; id: Id; origin: Point; start: { x: number; y: number }; startClient: Point; dragging: boolean }
  | { kind: 'resize'; id: Id; handle: Handle }
  | { kind: 'rect'; mode: 'area' | 'cut'; origin: Point };

const DRAG_THRESHOLD_PX = 4;
const MESSAGE_MS = 4000;
const NUDGE_M = 0.1;
const FINE_NUDGE_M = 0.01;

interface Args {
  content: PlanContent;
  tool: Tool;
  setTool: (tool: Tool) => void;
  selectedId: Id | null;
  select: (id: Id | null) => void;
  viewport: ViewportApi;
  commit: CommitFn;
}

const snapPoint = ([x, y]: Point): Point => [snapFloor(x), snapFloor(y)];

function rectPreview(mode: 'area' | 'cut', a: Point, b: Point): Extract<Preview, { kind: 'rect' }> {
  return { kind: 'rect', mode, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), d: Math.abs(a[1] - b[1]) };
}

export function usePlanGestures({ content, tool, setTool, selectedId, select, viewport, commit }: Args) {
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const setPreview = (next: Preview | null): void => {
    previewRef.current = next;
    setPreviewState(next);
  };
  const run = (command: PlanCommand, coalesceKey?: string): boolean => {
    const problem = commit(command, coalesceKey);
    setMessage(problem);
    return problem === null;
  };
  const cancel = (): void => {
    gesture.current = null;
    setPreview(null);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    if (e.button === 2) return;
    const world = viewport.clientToWorld(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pan' || spaceHeld || e.button === 1) {
      gesture.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (tool === 'area' || tool === 'cut') {
      const origin = snapPoint(world);
      gesture.current = { kind: 'rect', mode: tool, origin };
      setPreview(rectPreview(tool, origin, origin));
      return;
    }
    if (isPlacementTool(tool)) {
      const draft = createObject(tool, { x: 0, y: 0 }, content.objects);
      const [px, py] = snapPoint(world);
      const x = Math.min(Math.max(0, px), Math.max(0, content.survey.width - draft.w));
      const y = Math.min(Math.max(0, py), Math.max(0, content.survey.length - draft.d));
      const object = { ...draft, x: snapFloor(x), y: snapFloor(y) };
      if (run({ type: 'object/add', object })) {
        select(object.id);
        setTool('select');
      }
      return;
    }
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle') as Handle | null;
    if (handle && selectedId) {
      gesture.current = { kind: 'resize', id: selectedId, handle };
      return;
    }
    const hit = hitTest(content.objects, world);
    if (!hit) {
      select(null);
      return;
    }
    select(hit.id);
    gesture.current = { kind: 'move', id: hit.id, origin: world, start: { x: hit.x, y: hit.y }, startClient: [e.clientX, e.clientY], dragging: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      viewport.panBy(e.clientX - g.lastX, e.clientY - g.lastY);
      gesture.current = { ...g, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    const world = viewport.clientToWorld(e.clientX, e.clientY);
    if (g.kind === 'rect') {
      setPreview(rectPreview(g.mode, g.origin, snapPoint(world)));
      return;
    }
    if (g.kind === 'move') {
      const moved = Math.hypot(e.clientX - g.startClient[0], e.clientY - g.startClient[1]);
      if (!g.dragging && moved < DRAG_THRESHOLD_PX) return;
      gesture.current = { ...g, dragging: true };
      setPreview({
        kind: 'object',
        id: g.id,
        patch: { x: snapDrag(g.start.x + world[0] - g.origin[0]), y: snapDrag(g.start.y + world[1] - g.origin[1]) },
      });
      return;
    }
    const object = content.objects.find((o) => o.id === g.id);
    if (object) setPreview({ kind: 'object', id: g.id, patch: resizePlacement(object, g.handle, world) });
  };

  const onPointerUp = (): void => {
    const g = gesture.current;
    const p = previewRef.current;
    cancel();
    if (!g || g.kind === 'pan' || !p) return;
    if (g.kind === 'rect' && p.kind === 'rect') {
      if (p.w > 0 && p.d > 0) {
        run({ type: g.mode === 'area' ? 'floor/add' : 'floor/cut', rect: { id: newId(), x: p.x, y: p.y, w: p.w, d: p.d } });
      }
      return;
    }
    if (p.kind === 'object') run({ type: 'object/update', id: p.id, patch: p.patch });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === ' ') {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (e.key === 'Escape') {
      if (gesture.current) cancel();
      else if (tool !== 'select') setTool('select');
      else select(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const nextTool = toolForKey(e.key);
    if (nextTool) {
      setTool(nextTool);
      return;
    }
    const selected = content.objects.find((o) => o.id === selectedId);
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (run({ type: 'object/remove', id: selected.id })) select(null);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      run({ type: 'object/rotate', id: selected.id, by: e.shiftKey ? -45 : 45 });
      return;
    }
    const step = e.shiftKey ? FINE_NUDGE_M : NUDGE_M;
    const delta: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[e.key];
    if (move) {
      e.preventDefault();
      run({ type: 'object/update', id: selected.id, patch: { x: selected.x + move[0], y: selected.y + move[1] } }, `nudge:${selected.id}`);
    }
  };

  const onKeyUp = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === ' ') setSpaceHeld(false);
  };

  const panning = tool === 'pan' || spaceHeld || gesture.current?.kind === 'pan';
  const cursor = panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const svgHandlers: SvgHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  };

  return { preview, cursor, message, svgHandlers, onKeyDown, onKeyUp };
}
