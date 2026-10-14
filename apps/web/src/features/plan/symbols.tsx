import { localToWorld, type RoomObject } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';

const ARC_STEPS = 18;
const CHAR_PX_12 = 7.3;
const LABEL_PAD_PX = 10;
const MIN_CHARS = 3;

const pt = (o: RoomObject, view: View, u: number, v: number): [number, number] => toScreen(view, localToWorld(o, [u, v]));
const path = (points: [number, number][]): string => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

/**
 * Architectural door: the opening between two jambs, the leaf drawn open at 90° from its hinge,
 * and the quarter-circle swing. It opens towards the door's front (local +y); the hinge picks the end.
 */
export function DoorSymbol({ o, view }: { o: RoomObject; view: View }) {
  const hx = (o.type !== 'rack' && o.hinge === 'right' ? 1 : -1) * (o.w / 2);
  const face = o.d / 2;
  const [hX, hY] = pt(o, view, hx, face);
  const [lX, lY] = pt(o, view, hx, face + o.w);
  const arc = Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const t = ((i / ARC_STEPS) * Math.PI) / 2;
    // From the open leaf (perpendicular) round to the closed position at the far jamb.
    return pt(o, view, hx - Math.sign(hx) * o.w * Math.sin(t), face + o.w * Math.cos(t));
  });
  return (
    <g aria-hidden="true">
      <path className="door__jamb" d={`${path([pt(o, view, -o.w / 2, -o.d / 2), pt(o, view, -o.w / 2, o.d / 2)])} ${path([pt(o, view, o.w / 2, -o.d / 2), pt(o, view, o.w / 2, o.d / 2)])}`} />
      <line className="door__leaf" x1={hX} y1={hY} x2={lX} y2={lY} />
      <path className="door__swing" d={path(arc)} />
    </g>
  );
}

/** Distribution board: the panel outline with a lightning bolt, as on electrical drawings. */
export function McbSymbol({ o, view }: { o: RoomObject; view: View }) {
  const s = (u: number, v: number) => pt(o, view, u * o.w, v * o.d);
  return <path aria-hidden="true" className="mcb__bolt" d={path([s(0.08, -0.38), s(-0.1, 0.04), s(0.06, 0.04), s(-0.08, 0.38)])} />;
}

/** Shortens a label to fit `availablePx`; null when even a few characters won't fit. */
export function fitLabel(text: string, availablePx: number, charPx = CHAR_PX_12): string | null {
  const room = availablePx - LABEL_PAD_PX;
  if (text.length * charPx <= room) return text;
  const n = Math.floor(room / charPx) - 1;
  return n < MIN_CHARS ? null : `${text.slice(0, n)}…`;
}

/** Name tag above an object, revealed on hover or keyboard focus by CSS. */
export function HoverTag({ name, x, y }: { name: string; x: number; y: number }) {
  const w = name.length * CHAR_PX_12 + 14;
  return (
    <g className="obj__hover-tag" aria-hidden="true" transform={`translate(${x - w / 2} ${y - 26})`}>
      <rect width={w} height={20} rx={3} />
      <text className="obj__hover" x={w / 2} y={14} textAnchor="middle">
        {name}
      </text>
    </g>
  );
}
