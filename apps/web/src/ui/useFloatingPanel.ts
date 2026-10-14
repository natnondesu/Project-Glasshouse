import { useRef, type PointerEvent } from 'react';
import { usePersistentState } from './usePersistentState';

/** A floating panel dragged by its header, remembered per browser under `key`. */
export function useFloatingPanel(key: string, initial: { x: number; y: number }) {
  const [pos, setPos] = usePersistentState(key, initial);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const headProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>): void => {
      if ((e.target as Element).closest('button, input, select')) return;
      drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>): void => {
      if (drag.current) setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy) });
    },
    onPointerUp: (): void => {
      drag.current = null;
    },
  };
  return { pos, headProps };
}
