import type { Point } from '@glasshouse/domain';
import type { Feed3D } from './scene';

const CONDUIT_M = 0.028;
const FLOOR_Y = CONDUIT_M / 2 + 0.004;

type Vec3 = [number, number, number];

function Segment({ a, b, color }: { a: Vec3; b: Vec3; color: string }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const vertical = Math.abs(dy) > Math.hypot(dx, dz);
  return (
    <mesh position={mid} rotation={vertical ? [0, 0, 0] : [0, -Math.atan2(dz, dx), 0]} castShadow>
      <boxGeometry args={vertical ? [CONDUIT_M, len + CONDUIT_M, CONDUIT_M] : [len + CONDUIT_M, CONDUIT_M, CONDUIT_M]} />
      <meshStandardMaterial color={color} roughness={0.5} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

/** A feed as a simple conduit: out of the panel, down the wall, along the floor, up into the rack or the next source. */
export function FeedModel({ feed, color }: { feed: Feed3D; color: string }) {
  const at = ([x, z]: Point, y: number): Vec3 => [x, y, z];
  const [panel, wall, ...rest] = feed.route;
  if (!panel || !wall || rest.length === 0) return null;
  const floor = [wall, ...rest].map((p) => at(p, FLOOR_Y));
  const end = floor[floor.length - 1]!;
  const points: Vec3[] = [at(panel, feed.dropFrom), at(wall, feed.dropFrom), ...floor, [end[0], Math.max(FLOOR_Y, feed.riseTo), end[2]]];
  return (
    <group name={`feed-${feed.feed.label}`}>
      {points.slice(1).map((b, i) => (
        <Segment key={i} a={points[i]!} b={b} color={color} />
      ))}
    </group>
  );
}
