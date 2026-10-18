import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three';
import { breakerLayout } from './breakerLayout';
import type { Palette3D } from './palette';
import { NO_PICK } from './picking';
import type { Panel3D } from './scene';

const BREAKER_DEPTH_M = 0.022;
const LEVER_DEPTH_M = 0.014;
const LEVER_W_SHARE = 0.4;
const LEVER_H_SHARE = 0.3;
/** A lever sits in the upper part of its breaker when the way carries a feed (on), the lower part when it is spare (off). */
const LEVER_OFFSET_SHARE = 0.2;

interface Props {
  panel: Panel3D;
  /** Cabinet face size; the face's z is `faceZ`. */
  w: number;
  h: number;
  faceZ: number;
  palette: Palette3D;
}

const IDENTITY = new Quaternion();

/** Every breaker of a panel as two instanced meshes (bodies, levers), so a 72-way panel is two draw calls. */
export function PanelBreakers({ panel, w, h, faceZ, palette }: Props) {
  const bodies = useRef<InstancedMesh>(null);
  const levers = useRef<InstancedMesh>(null);
  const layout = useMemo(() => breakerLayout(panel, w, h), [panel, w, h]);
  const colours = panel.inUse ? palette.mcb : { ...palette.mcb, breaker: palette.mcb.offBreaker, lever: palette.mcb.offLever, leverSpare: palette.mcb.offLever };
  const main = layout.main;
  const count = layout.ways.length;

  useLayoutEffect(() => {
    const body = bodies.current;
    const lever = levers.current;
    if (!body || !lever) return;
    const m = new Matrix4();
    const bodyColour = new Color(colours.breaker);
    layout.ways.forEach((b, i) => {
      m.compose(new Vector3(b.x, b.y, faceZ + BREAKER_DEPTH_M / 2), IDENTITY, new Vector3(b.w, b.h, BREAKER_DEPTH_M));
      body.setMatrixAt(i, m);
      body.setColorAt(i, bodyColour);
      const dy = (b.fed ? 1 : -1) * b.h * LEVER_OFFSET_SHARE;
      m.compose(new Vector3(b.x, b.y + dy, faceZ + BREAKER_DEPTH_M + LEVER_DEPTH_M / 2), IDENTITY, new Vector3(b.w * LEVER_W_SHARE, b.h * LEVER_H_SHARE, LEVER_DEPTH_M));
      lever.setMatrixAt(i, m);
      lever.setColorAt(i, new Color(b.fed ? colours.lever : colours.leverSpare));
    });
    for (const mesh of [body, lever]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [layout, faceZ, colours.breaker, colours.lever, colours.leverSpare]);

  return (
    <group>
      <instancedMesh key={`b${count}`} ref={bodies} args={[undefined, undefined, count]} raycast={NO_PICK} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh key={`l${count}`} ref={levers} args={[undefined, undefined, count]} raycast={NO_PICK} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      {main ? (
        <group raycast={NO_PICK}>
          <mesh position={[main.x, main.y, faceZ + BREAKER_DEPTH_M / 2]} raycast={NO_PICK}>
            <boxGeometry args={[main.w, main.h, BREAKER_DEPTH_M]} />
            <meshStandardMaterial color={colours.breaker} roughness={0.5} />
          </mesh>
          <mesh position={[main.x, main.y + main.h * 0.12, faceZ + BREAKER_DEPTH_M + LEVER_DEPTH_M / 2]} raycast={NO_PICK}>
            <boxGeometry args={[main.w * 0.78, main.h * 0.34, LEVER_DEPTH_M]} />
            <meshStandardMaterial color={colours.lever} roughness={0.45} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
