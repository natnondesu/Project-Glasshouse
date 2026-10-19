import { currentRevision, equipmentStateOf, type RoomLocation } from '@glasshouse/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { IconPause, IconPlay } from '../../ui/icons';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion';
import { defaultCamera, type OrbitCamera } from '../room3d/camera';
import { readPalette } from '../room3d/palette';
import { hasWebGL, Room3DCanvas } from '../room3d/Room3DCanvas';
import { buildScene } from '../room3d/scene';
import '../room3d/room3d.css';

/** About 7° a second: one turn a minute, slow enough to read the rack names as they pass. */
const SPIN_RAD_PER_S = 0.11;
const RACK_LABELS = ['rack' as const];

/**
 * The last room, live in 3D, turning slowly. It stops while the pointer is over it (so a drag looks
 * around from where it is), when paused, under reduced motion, and draws nothing once scrolled away.
 * Clicking a rack opens it in the elevation; the rack names under the scene do the same from the keyboard
 * and light their rack while pointed at.
 */
/**
 * `caption` replaces the hint in the corner chip (the site card names the room there instead). `compact` (the site card) leaves out the rack-name
 * links under the scene: in a small card they crowd the room, and the card's Open button is the way in.
 */
export default function HeroScene({ location, caption, compact = false }: { location: RoomLocation; caption?: string; compact?: boolean }) {
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
  const [pointed, setPointed] = useState<string | null>(null);
  const racks = [...scene.racks].sort((a, b) => a.name.localeCompare(b.name));
  const openRack = (id: string | null): void => {
    if (id && scene.racks.some((r) => r.id === id)) void navigate(`/rooms/${location.room.id}/elevation?sel=${id}`);
  };

  if (!webgl) return <p className="home-hero__fallback">{m.room3d.noWebgl}</p>;
  return (
    <div ref={box} className="home-hero__scene" role="group" aria-label={m.home.scene3d(location.room.name, racks.length)} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <Room3DCanvas
        scene={scene}
        palette={palette}
        camera={camera}
        onCamera={setCamera}
        selectedId={pointed}
        onSelect={openRack}
        labelKinds={RACK_LABELS}
        spin={spinning ? SPIN_RAD_PER_S : 0}
        wheel={false}
        idle={!inView}
        onDemand
      />
      {racks.length > 0 && !compact ? (
        <nav className="home-hero__racks" aria-label={m.home.racksNav}>
          {racks.map((r) => (
            <Link
              key={r.id}
              to={`/rooms/${location.room.id}/elevation?sel=${r.id}`}
              className="mono home-hero__rack"
              onPointerEnter={() => setPointed(r.id)}
              onPointerLeave={() => setPointed(null)}
              onFocus={() => setPointed(r.id)}
              onBlur={() => setPointed(null)}
            >
              {r.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <p className="home-hero__chip">
        <span className="home-hero__dot" aria-hidden="true" />
        <span className="mono">3D</span>
        {caption ?? (reduced ? m.home.sceneStill : m.home.sceneHint)}
      </p>
      {reduced ? null : (
        <button type="button" className="icon-btn home-hero__pause" aria-pressed={paused} aria-label={paused ? m.home.play : m.home.pause} title={paused ? m.home.play : m.home.pause} onClick={() => setPaused(!paused)}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
      )}
    </div>
  );
}
