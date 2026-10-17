import type { Id, Rack } from '@glasshouse/domain';
import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** Movement before a press on a rack's name becomes a drag; less is a click that selects it. */
const DRAG_START_PX = 6;
/** Near the racks area's edge a drag scrolls it, so a far rack can be reached. */
const EDGE_PX = 48;
const EDGE_STEP_PX = 14;

interface RackDrag {
  id: Id;
  dx: number;
  /** Where it would land among the other racks (0 = first). */
  target: number;
}

/**
 * Reordering racks in Elevation: drag a rack by its name, or Alt+←/→ with its name focused. The order
 * is saved on the room's plan (beside the revisions), so it holds on an approved plan and in the file.
 */
export function useRackReorder({ area, racks, roomId, enabled }: { area: RefObject<HTMLElement | null>; racks: Rack[]; roomId: Id; enabled: boolean }) {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [drag, setDrag] = useState<RackDrag | null>(null);
  const latest = useRef(racks);
  latest.current = racks;

  const save = (ids: Id[] | null): void => void dispatch({ type: 'rack/order', roomId, ids });
  const moveTo = (id: Id, index: number): void => {
    const others = latest.current.map((r) => r.id).filter((x) => x !== id);
    const at = Math.max(0, Math.min(others.length, index));
    save([...others.slice(0, at), id, ...others.slice(at)]);
  };

  const start = (e: PointerEvent<HTMLElement>, id: Id): void => {
    if (!enabled || e.button !== 0) return;
    const x0 = e.clientX;
    const scroll0 = area.current?.scrollLeft ?? 0;
    let moved = false;
    let target = latest.current.findIndex((r) => r.id === id);
    const mids = (): number[] =>
      [...(area.current?.querySelectorAll<HTMLElement>('[data-rack-slot]') ?? [])]
        .filter((el) => el.dataset.rackSlot !== id)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return r.left + r.width / 2;
        });
    const onMove = (ev: globalThis.PointerEvent): void => {
      const el = area.current;
      if (!moved && Math.abs(ev.clientX - x0) < DRAG_START_PX) return;
      moved = true;
      if (el) {
        const box = el.getBoundingClientRect();
        if (ev.clientX > box.right - EDGE_PX) el.scrollLeft += EDGE_STEP_PX;
        if (ev.clientX < box.left + EDGE_PX) el.scrollLeft -= EDGE_STEP_PX;
      }
      target = mids().filter((m) => m < ev.clientX).length;
      setDrag({ id, dx: ev.clientX - x0 + ((el?.scrollLeft ?? 0) - scroll0), target });
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (!moved) return;
      // The press ended a drag, not a click: don't let it also select the rack.
      const swallow = (c: MouseEvent): void => c.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      // No click may follow (released off the name); never let the guard eat a later, real one.
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      moveTo(id, target);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>, id: Id): void => {
    if (!enabled || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const index = latest.current.findIndex((r) => r.id === id);
    moveTo(id, index + (e.key === 'ArrowLeft' ? -1 : 1));
  };

  return { drag, start, onKey, reset: () => save(null) };
}
