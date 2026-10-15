import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import type { Palette3D } from './palette';
import { NO_PICK } from './picking';
import { Edges } from './RoomModels';
import { RACK_BASE_M, type Rack3D } from './scene';
import { deviceFrontTexture, labelTexture, railTexture, reservedTexture } from './textures';
import { useT } from '../../i18n';

const CLICK_SLOP_PX = 4;
const POST_M = 0.04;
const PANEL_M = 0.012;
const RAIL_W_M = 0.022;
const GHOST_OPACITY = 0.45;
/** Device fronts sit just behind the front rails, like real rack-mount gear. */
const RAIL_SETBACK_M = 0.035;
/** Labels keep a fixed on-screen height (no distance attenuation), so they stay readable at any zoom. */
const LABEL_H_SCREEN = 0.0455;
const LABEL_LIFT_M = 0.35;
const LABEL_STAGGER_M = 0.62;

interface RackModelProps {
  rack: Rack3D;
  palette: Palette3D;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Existing racks reuse the frame, greyed and without equipment. */
  existing?: boolean;
  /** Lifts every other label so neighbouring racks' labels don't overlap. */
  stagger?: boolean;
  /** Always show the label, or only on hover and selection. */
  labels?: 'always' | 'hover';
  /** On the highlighted power path. */
  onPath?: boolean;
}

function Frame({ w, h, d, color }: { w: number; h: number; d: number; color: string }) {
  const posts: [number, number][] = [
    [-w / 2 + POST_M / 2, d / 2 - POST_M / 2],
    [w / 2 - POST_M / 2, d / 2 - POST_M / 2],
    [-w / 2 + POST_M / 2, -d / 2 + POST_M / 2],
    [w / 2 - POST_M / 2, -d / 2 + POST_M / 2],
  ];
  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]} castShadow>
          <boxGeometry args={[POST_M, h, POST_M]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, h / 2 - POST_M / 2, 0]} castShadow>
        <boxGeometry args={[w, POST_M, d]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, -h / 2 + RACK_BASE_M / 2, 0]}>
        <boxGeometry args={[w, RACK_BASE_M, d]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (w / 2 - PANEL_M / 2), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[PANEL_M, h - POST_M, d - POST_M * 2]} />
          <meshStandardMaterial color={color} roughness={0.75} metalness={0.15} />
        </mesh>
      ))}
      <mesh position={[0, 0, -d / 2 + PANEL_M]}>
        <boxGeometry args={[w - PANEL_M * 2, h - POST_M, PANEL_M]} />
        <meshStandardMaterial color="#14191f" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Label({ rack, accent, h, existing, stagger }: { rack: Rack3D; accent: string; h: number; existing: boolean; stagger: boolean }) {
  const m = useT();
  const sub = existing ? m.room3d.existingRack : rack.owner === 'customer' ? m.room3d.customerU(rack.capacityU) : `${rack.usedU}/${rack.capacityU}U`;
  const { map, aspect } = useMemo(() => labelTexture(rack.name, sub, accent), [rack.name, sub, accent]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <sprite raycast={NO_PICK} position={[0, h / 2 + LABEL_LIFT_M + (stagger ? LABEL_STAGGER_M : 0), 0]} scale={[LABEL_H_SCREEN * aspect, LABEL_H_SCREEN, 1]} renderOrder={10}>
      <spriteMaterial map={map} depthTest={false} transparent sizeAttenuation={false} />
    </sprite>
  );
}

export function RackModel({ rack, palette, selected, onSelect, existing = false, stagger = false, labels = 'always', onPath = false }: RackModelProps) {
  const [w, h, d] = rack.size;
  const [hover, setHover] = useState(false);
  const frontZ = d / 2 - RAIL_SETBACK_M;
  const innerW = w - RAIL_W_M * 2 - PANEL_M * 2 - 0.01;
  const rails = useMemo(() => railTexture(rack.capacityU), [rack.capacityU]);
  const hatch = useMemo(() => reservedTexture(), []);
  useEffect(() => () => hatch.dispose(), [hatch]);
  const frameColor = existing ? palette.object.existing_rack : rack.owner === 'customer' ? palette.rackCustomer : palette.rack;
  const accent = selected ? palette.front : palette.wall;

  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP_PX) onSelect(rack.id);
  };

  return (
    <group
      position={rack.position}
      rotation={[0, rack.yaw, 0]}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
      name={rack.name}
    >
      <Frame w={w} h={h} d={d} color={frameColor} />
      {existing ? null : (
        <>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (w / 2 - PANEL_M - RAIL_W_M / 2), 0, d / 2 - RAIL_SETBACK_M / 2]}>
              <boxGeometry args={[RAIL_W_M, h - RACK_BASE_M - POST_M, 0.006]} />
              <meshStandardMaterial map={rails} roughness={0.6} />
            </mesh>
          ))}
          {rack.faces.map((f) => (
            <DeviceModel key={f.id} face={f} width={innerW} h={h} frontZ={frontZ} palette={palette} />
          ))}
          {rack.slots.map((s) => {
            // Slot positions come from the 2D face width; scale them onto the inner width between the rails.
            const k = innerW / (rack.faces.find((f) => f.id === s.chassisId)?.width ?? innerW);
            return (
              <group key={`${s.chassisId}-${s.slot}`} position={[s.x * k, s.y - h / 2, frontZ + 0.003]}>
                <mesh>
                  <planeGeometry args={[s.width * k, s.height]} />
                  <meshStandardMaterial color={s.filled ? palette.category.compute : '#11161b'} roughness={0.5} />
                </mesh>
                {s.filled ? (
                  <mesh position={[0, s.height / 2 - 0.02, 0.001]}>
                    <circleGeometry args={[0.006, 12]} />
                    <meshBasicMaterial color="#4cd17a" />
                  </mesh>
                ) : null}
              </group>
            );
          })}
          {rack.reserved.map((r) => (
            <mesh key={r.id} position={[0, r.y - h / 2, frontZ - (d - 0.1) / 2]}>
              <boxGeometry args={[innerW, r.height, d - 0.1]} />
              <meshStandardMaterial map={hatch} transparent opacity={0.85} depthWrite={false} />
            </mesh>
          ))}
          {/* Front marker: an accent strip along the top front edge, matching the 2D Front bar. */}
          <mesh position={[0, h / 2 + 0.004, d / 2 - 0.03]}>
            <boxGeometry args={[w, 0.008, 0.06]} />
            <meshStandardMaterial color={palette.front} emissive={palette.front} emissiveIntensity={0.35} />
          </mesh>
        </>
      )}
      <Edges size={rack.size} color={selected || hover || onPath ? palette.front : palette.wall} opacity={selected ? 1 : hover || onPath ? 0.8 : 0.45} />
      {selected ? (
        <mesh position={[0, -h / 2 + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_PICK}>
          <planeGeometry args={[w + 0.16, d + 0.16]} />
          <meshBasicMaterial color={palette.front} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ) : null}
      {labels === 'always' || hover || selected || onPath ? <Label rack={rack} accent={accent} h={h} existing={existing} stagger={labels === 'always' && stagger} /> : null}
    </group>
  );
}

function DeviceModel({ face, width, h, frontZ, palette }: { face: Rack3D['faces'][number]; width: number; h: number; frontZ: number; palette: Palette3D }) {
  const map = useMemo(
    () => deviceFrontTexture({ category: face.category, heightU: face.heightU, accent: palette.category[face.category], unknown: face.unknown, name: face.name, maintenance: face.state === 'maintenance' }),
    [face.category, face.heightU, face.unknown, face.name, face.state, palette],
  );
  const y = face.y - h / 2;
  // Planned equipment isn't there yet: drawn as a ghost.
  const ghost = face.state === 'planned';
  return (
    <group position={[0, y, frontZ - face.depth / 2]}>
      <mesh castShadow>
        <boxGeometry args={[width, face.height, face.depth]} />
        <meshStandardMaterial color="#2b333c" roughness={0.55} metalness={0.35} transparent={ghost} opacity={ghost ? GHOST_OPACITY : 1} />
      </mesh>
      <mesh position={[0, 0, face.depth / 2 + 0.0015]}>
        <planeGeometry args={[width, face.height]} />
        <meshStandardMaterial map={map} roughness={0.5} metalness={0.2} transparent={ghost} opacity={ghost ? GHOST_OPACITY : 1} />
      </mesh>
    </group>
  );
}
