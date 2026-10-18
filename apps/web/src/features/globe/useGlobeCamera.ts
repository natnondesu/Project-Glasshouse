import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampCamera, flight, FLIGHT_MS, levelOf, type Camera, type Size } from './camera';

/** About 3° a second: the world view turns slowly, like the room 3D does. */
const SPIN_DEG_PER_S = 3;
/** The slow turn redraws at about 30 frames a second; flights keep every frame. */
const SPIN_FRAME_MS = 33;

interface Flight {
  at: (t: number) => Camera;
  start: number;
  ms: number;
}

/**
 * The map's camera: flights (one ease; jump cuts under reduced motion), the slow world spin, and nothing else moving.
 * Frames are requested only while something moves, so an idle map costs nothing.
 */
export function useGlobeCamera(size: Size | null, initial: (size: Size) => Camera, { reduced, spin }: { reduced: boolean; spin: boolean }) {
  const [camera, setCamera] = useState<Camera | null>(null);
  const [flying, setFlying] = useState(false);
  const current = useRef<Flight | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  cameraRef.current = camera;

  useLayoutEffect(() => {
    if (!size) return;
    setCamera((c) => (c ? clampCamera(c, size) : initial(size)));
    // `initial` is only for the first frame; later changes of it must not reset the view.
  }, [size]);

  const stop = useCallback((): void => {
    current.current = null;
    setFlying(false);
  }, []);

  const jumpTo = useCallback(
    (target: Camera): void => {
      if (!size) return;
      stop();
      setCamera(clampCamera(target, size));
    },
    [size, stop],
  );

  const flyTo = useCallback(
    (target: Camera, ms = FLIGHT_MS): void => {
      const from = cameraRef.current;
      if (!size || !from) return;
      const to = clampCamera(target, size);
      if (reduced) {
        jumpTo(to);
        return;
      }
      current.current = { at: flight(from, to, size), start: performance.now(), ms };
      setFlying(true);
    },
    [size, reduced, jumpTo],
  );

  // `spin` is whether turning is welcome; it only ever happens on the world view.
  const spinning = spin && !flying && !reduced && camera !== null && levelOf(camera.ppd) === 'world';
  useEffect(() => {
    if (!flying && !spinning) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const f = current.current;
      if (!f && now - last < SPIN_FRAME_MS - 2) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (f) {
        const t = Math.min(1, (now - f.start) / f.ms);
        setCamera(f.at(t));
        if (t >= 1) {
          current.current = null;
          setFlying(false);
          return;
        }
      } else if (spinning) {
        setCamera((c) => (c && size ? clampCamera({ ...c, lon: c.lon - SPIN_DEG_PER_S * dt }, size) : c));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flying, spinning, size]);

  return { camera, flyTo, jumpTo, stop, flying, spinning };
}
