import type { CommitFn } from '../../store/hooks';
import { createObject, newId, snapDrag, snapFloor, type Id, type PlanCommand, type PlanContent, type Point } from '@glasshouse/domain';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { clampIntoRoom } from './clamp';
import { hitTest } from './hitTest';
import { describeRackContents } from './labels';
import { snapMeasurePoint, type SnapTarget } from './measure';
import type { Preview } from './layers';
import type { SvgHandlers } from './PlanCanvas';
import { resizePlacement, type Handle } from './resize';
import { isPlacementTool, toolForKey, type Tool } from './tools';

export type { CommitFn } from '../../store/hooks';

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move'; id: Id; origin: Point; start: { x: number; y: number }; startClient: Point; dragging: boolean }
  | { kind: 'resize'; id: Id; handle: Handle }
  | { kind: 'rect'; mode: 'area' | 'cut'; origin: Point };

const DRAG_THRESHOLD_PX = 4;
const MESSAGE_MS = 4000;
const NUDGE_M = 0.1;
const FINE_NUDGE_M = 0.01;
const MEASURE_SNAP_PX = 10;

export interface MeasureState {
  a: SnapTarget | null;
  b: SnapTarget | null;
  /** Live snapped cursor while the Measure tool is active. */
  cursor: SnapTarget | null;
  /** Object under the cursor; its gaps to the walls are shown. */
  hoverId: Id | null;
}

const NO_MEASURE: MeasureState = { a: null, b: null, cursor: null, hoverId: null };

interface Args {
  content: PlanContent;
  tool: Tool;
  setTool: (tool: Tool) => void;
  selectedId: Id | null;
  select: (id: Id | null) => void;
  viewport: ViewportApi;
  commit: CommitFn;
  readOnly?: boolean;
}

const snapPoint = ([x, y]: Point): Point => [snapFloor(x), snapFloor(y)];

function rectPreview(mode: 'area' | 'cut', a: Point, b: Point): Extract<Preview, { kind: 'rect' }> {
  return { kind: 'rect', mode, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), d: Math.abs(a[1] - b[1]) };
}

export function usePlanGestures({ content, tool, setTool, selectedId, select, viewport, commit, readOnly = false }: Args) {
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [measure, setMeasure] = useState<MeasureState>(NO_MEASURE);

  useEffect(() => setMeasure(NO_MEASURE), [tool]);

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
    if (tool === 'measure') {
      const snap = snapMeasurePoint(world, content, MEASURE_SNAP_PX / viewport.view.scale);
      setMeasure((m) => (m.a === null || m.b !== null ? { ...m, a: snap, b: null } : { ...m, b: snap }));
      return;
    }
    if (readOnly) {
      select(hitTest(content.objects, world)?.id ?? null);
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
    if (!g && tool === 'measure') {
      const world = viewport.clientToWorld(e.clientX, e.clientY);
      const cursorSnap = snapMeasurePoint(world, content, MEASURE_SNAP_PX / viewport.view.scale);
      setMeasure((m) => ({ ...m, cursor: cursorSnap, hoverId: hitTest(content.objects, world)?.id ?? null }));
      return;
    }
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
      const dragged = content.objects.find((o) => o.id === g.id);
      if (!dragged) return;
      const x = snapDrag(g.start.x + world[0] - g.origin[0]);
      const y = snapDrag(g.start.y + world[1] - g.origin[1]);
      setPreview({ kind: 'object', id: g.id, patch: clampIntoRoom(dragged, x, y, content.survey) });
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
      else if (tool === 'measure' && measure.a !== null) setMeasure(NO_MEASURE);
      else if (tool !== 'select') setTool('select');
      else select(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const nextTool = toolForKey(e.key);
    if (nextTool && (!readOnly || nextTool === 'select' || nextTool === 'pan' || nextTool === 'measure')) {
      setTool(nextTool);
      return;
    }
    if (readOnly) return;
    const selected = content.objects.find((o) => o.id === selectedId);
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const contents = selected.type === 'rack' ? describeRackContents(selected) : null;
      if (contents) {
        setMessage(`${selected.name} holds ${contents}. Remove it from the inspector to confirm.`);
        return;
      }
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
  const onPointerLeave = (): void => setMeasure((m) => ({ ...m, cursor: null, hoverId: null }));
  const svgHandlers: SvgHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave,
    onContextMenu: (e) => e.preventDefault(),
  };

  return { preview, cursor, message, measure, svgHandlers, onKeyDown, onKeyUp };
}
