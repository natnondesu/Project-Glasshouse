import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { Palette3D } from './palette';
import { NO_PICK } from './picking';
import { Edges, ObjectModel } from './RoomModels';
import type { Object3D } from './scene';
import { labelTexture } from './textures';

const CLICK_SLOP_PX = 4;
/** Fixed on-screen label height, a little smaller than rack labels so racks still lead. */
const LABEL_H_SCREEN = 0.04;
const LABEL_LIFT_M = 0.22;

function ObjectLabel({ object, accent }: { object: Object3D; accent: string }) {
  const m = useT();
  const sub = m.objects.type[object.type];
  const { map, aspect } = useMemo(() => labelTexture(object.name, sub, accent), [object.name, sub, accent]);
  useEffect(() => () => map.dispose(), [map]);
  const [x, y, z] = object.position;
  return (
    <sprite raycast={NO_PICK} position={[x, y + object.size[1] / 2 + LABEL_LIFT_M, z]} scale={[LABEL_H_SCREEN * aspect, LABEL_H_SCREEN, 1]} renderOrder={10}>
      <spriteMaterial map={map} depthTest={false} transparent sizeAttenuation={false} />
    </sprite>
  );
}

interface PickableObjectProps {
  object: Object3D;
  palette: Palette3D;
  selected: boolean;
  /** Label always, rather than only on hover and selection. */
  labelled: boolean;
  /** On the highlighted power path. */
  onPath?: boolean;
  onSelect: (id: string) => void;
}

/** A room object you can point at and click: outlined on hover, selected on click, labelled by choice. */
export function PickableObject({ object, palette, selected, labelled, onPath = false, onSelect }: PickableObjectProps) {
  const [hover, setHover] = useState(false);
  const click = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (e.delta <= CLICK_SLOP_PX) onSelect(object.id);
  };
  return (
    <group
      name={object.name}
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
    >
      <ObjectModel object={object} palette={palette} />
      {selected || hover || onPath ? (
        <group position={object.position} rotation={[0, object.yaw, 0]}>
          <Edges size={object.size} color={palette.front} opacity={selected ? 1 : 0.8} />
        </group>
      ) : null}
      {labelled || hover || selected || onPath ? <ObjectLabel object={object} accent={selected ? palette.front : palette.wall} /> : null}
    </group>
  );
}
