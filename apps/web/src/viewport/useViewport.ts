import type { Point } from '@glasshouse/domain';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { fit, pan, toWorld, wheelZoomFactor, zoomAt, type Insets, type View } from './math';

/** Leaves room for the floating glass panels: tools (left), inspector (right), checks (bottom). */
const FIT_INSETS: Insets = { top: 72, right: 392, bottom: 210, left: 132 };

export interface ViewportApi {
  svgRef: RefObject<SVGSVGElement | null>;
  size: { width: number; height: number };
  view: View;
  clientToWorld: (clientX: number, clientY: number) => Point;
  zoomBy: (factor: number) => void;
  fitToContent: () => void;
  panBy: (dx: number, dy: number) => void;
}

export function useViewport(content: { w: number; d: number }): ViewportApi {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ scale: 100, tx: 0, ty: 0 });
  const fitted = useRef(false);
  const { w, d } = content;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fitted.current || size.width === 0 || size.height === 0) return;
    fitted.current = true;
    setView(fit({ w, d }, size, FIT_INSETS));
  }, [size, w, d]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0) setView((v) => zoomAt(v, wheelZoomFactor(e.deltaY, e.deltaMode), sx, sy));
      else setView((v) => pan(v, -e.deltaX, -e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return toWorld(view, [clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)]);
    },
    [view],
  );

  return {
    svgRef,
    size,
    view,
    clientToWorld,
    zoomBy: (factor) => setView((v) => zoomAt(v, factor, size.width / 2, size.height / 2)),
    fitToContent: () => setView(fit({ w, d }, size, FIT_INSETS)),
    panBy: (dx, dy) => setView((v) => pan(v, dx, dy)),
  };
}
