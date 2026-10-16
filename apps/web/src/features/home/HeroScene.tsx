import { currentRevision, equipmentStateOf, type RoomLocation } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { IconPause, IconPlay } from '../../ui/icons';
import { defaultCamera, type OrbitCamera } from '../room3d/camera';
import { readPalette } from '../room3d/palette';
import { hasWebGL, Room3DCanvas } from '../room3d/Room3DCanvas';
import { buildScene } from '../room3d/scene';
import '../room3d/room3d.css';

/** About 7° a second: one turn a minute, slow enough to read the rack names as they pass. */
const SPIN_RAD_PER_S = 0.11;
const RACK_LABELS = ['rack' as const];

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * The last room, live in 3D, turning slowly. It stops while the pointer is over it (so a drag looks
 * around from where it is), when paused, under reduced motion, and draws nothing once scrolled away.
 * Clicking a rack opens it in the elevation.
 */
export default function HeroScene({ location }: { location: RoomLocation }) {
  const m = useT();
  const navigate = useNavigate();
  const content = currentRevision(location.room.plan).content;
  const plan = location.room.plan;
  const scene = useMemo(() => buildScene(content, (id) => equipmentStateOf(plan, id)), [content, plan]);
  const palette = useMemo(() => readPalette(), []);
  const [camera, setCamera] = useState<OrbitCamera>(() => defaultCamera(content.survey.width, content.survey.length));
  const [webgl] = useState(hasWebGL);
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [inView, setInView] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const spinning = !paused && !hover && !reduced;
  const openRack = (id: string | null): void => {
    if (id && scene.racks.some((r) => r.id === id)) void navigate(`/rooms/${location.room.id}/elevation?sel=${id}`);
  };

  if (!webgl) return <p className="home-hero__fallback">{m.room3d.noWebgl}</p>;
  return (
    <div ref={box} className="home-hero__scene" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <Room3DCanvas
        scene={scene}
        palette={palette}
        camera={camera}
        onCamera={setCamera}
        selectedId={null}
        onSelect={openRack}
        labelKinds={RACK_LABELS}
        spin={spinning ? SPIN_RAD_PER_S : 0}
        wheel={false}
        idle={!inView}
      />
      <p className="home-hero__chip">
        <span className="home-hero__dot" aria-hidden="true" />
        <span className="mono">3D</span>
        {reduced ? m.home.sceneStill : m.home.sceneHint}
      </p>
      {reduced ? null : (
        <button type="button" className="icon-btn home-hero__pause" aria-pressed={paused} aria-label={paused ? m.home.play : m.home.pause} title={paused ? m.home.play : m.home.pause} onClick={() => setPaused(!paused)}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
      )}
    </div>
  );
}
