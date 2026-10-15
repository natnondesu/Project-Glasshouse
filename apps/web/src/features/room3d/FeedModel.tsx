import type { Point } from '@glasshouse/domain';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ConeGeometry, Object3D as ThreeObject, Vector3, type InstancedMesh } from 'three';
import { NO_PICK } from './picking';
import type { Feed3D } from './scene';

const CONDUIT_M = 0.028;
const FLOOR_Y = CONDUIT_M / 2 + 0.004;
/** Flow arrows: one every this many metres, moving at this speed from source to load. */
const ARROW_SPACING_M = 0.45;
const FLOW_SPEED_M_S = 0.55;
const ARROW_R_M = 0.045;
const ARROW_LEN_M = 0.12;
const DIM_OPACITY = 0.16;

type Vec3 = [number, number, number];
export type FeedLook = 'normal' | 'path' | 'dim';

function Segment({ a, b, color, look }: { a: Vec3; b: Vec3; color: string; look: FeedLook }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const vertical = Math.abs(dy) > Math.hypot(dx, dz);
  const t = look === 'path' ? CONDUIT_M * 1.4 : CONDUIT_M;
  return (
    <mesh position={mid} rotation={vertical ? [0, 0, 0] : [0, -Math.atan2(dz, dx), 0]} castShadow={look !== 'dim'}>
      <boxGeometry args={vertical ? [t, len + t, t] : [len + t, t, t]} />
      {/* Keyed by look: three.js only applies a change of transparency to a freshly built material. */}
      <meshStandardMaterial
        key={look}
        color={color}
        roughness={0.5}
        emissive={color}
        emissiveIntensity={look === 'path' ? 0.55 : 0.15}
        transparent={look === 'dim'}
        opacity={look === 'dim' ? DIM_OPACITY : 1}
        depthWrite={look !== 'dim'}
      />
    </mesh>
  );
}

/** The run as 3D points, source first: out of the panel, down the wall, along the floor, up into the load. */
export function feedPoints(feed: Feed3D): Vec3[] | null {
  const at = ([x, z]: Point, y: number): Vec3 => [x, y, z];
  const [panel, wall, ...rest] = feed.route;
  if (!panel || !wall || rest.length === 0) return null;
  const floor = [wall, ...rest].map((p) => at(p, FLOOR_Y));
  const end = floor[floor.length - 1]!;
  return [at(panel, feed.dropFrom), at(wall, feed.dropFrom), ...floor, [end[0], Math.max(FLOOR_Y, feed.riseTo), end[2]]];
}

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** Arrowheads travelling along the run in the direction current flows; still, but still pointing, under reduced motion. */
function FlowArrows({ points, color }: { points: Vec3[]; color: string }) {
  const mesh = useRef<InstancedMesh>(null);
  const still = useMemo(prefersReducedMotion, []);
  const path = useMemo(() => {
    const segs = points.slice(1).map((b, i) => {
      const a = new Vector3(...points[i]!);
      const v = new Vector3(...b).sub(a);
      return { a, dir: v.clone().normalize(), len: v.length() };
    });
    const total = segs.reduce((s, x) => s + x.len, 0);
    return { segs, total, count: Math.max(2, Math.round(total / ARROW_SPACING_M)) };
  }, [points]);
  const geometry = useMemo(() => new ConeGeometry(ARROW_R_M, ARROW_LEN_M, 12), []);
  const dummy = useMemo(() => new ThreeObject(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);
  const place = (offset: number): void => {
    const m = mesh.current;
    const first = path.segs[0];
    if (!m || !first || path.total === 0) return;
    for (let i = 0; i < path.count; i += 1) {
      let along = (offset + (i * path.total) / path.count) % path.total;
      let seg = first;
      for (const x of path.segs) {
        seg = x;
        if (along <= x.len) break;
        along -= x.len;
      }
      dummy.position.copy(seg.a).addScaledVector(seg.dir, Math.min(along, seg.len));
      dummy.quaternion.setFromUnitVectors(up, seg.dir);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  };
  useFrame(({ clock }) => place(still ? 0 : clock.getElapsedTime() * FLOW_SPEED_M_S));
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, path.count]} raycast={NO_PICK}>
      <meshBasicMaterial color={color} />
    </instancedMesh>
  );
}

/** A feed as a simple conduit; on a highlighted power path it glows and shows which way current flows. */
export function FeedModel({ feed, color, look = 'normal' }: { feed: Feed3D; color: string; look?: FeedLook }) {
  const points = feedPoints(feed);
  if (!points) return null;
  return (
    <group name={`feed-${feed.feed.label}`}>
      {points.slice(1).map((b, i) => (
        <Segment key={i} a={points[i]!} b={b} color={color} look={look} />
      ))}
      {look === 'path' ? <FlowArrows points={points} color={color} /> : null}
    </group>
  );
}
