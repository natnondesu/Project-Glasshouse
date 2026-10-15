import { localToWorld, type RoomObject } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';

const ARC_STEPS = 18;
/** Sliding door drawing, in metres: the track sits off the wall face, the parked leaf laps the opening a little. */
const SLIDE_STANDOFF_M = 0.05;
const SLIDE_OVERLAP_M = 0.05;
const SLIDE_ARROW_M = 0.25;
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

/**
 * Sliding door: the opening between two jambs, the leaf parked along the wall beside it on its track,
 * and an arrow across the opening for the direction it slides. No swing, so nothing in front is claimed.
 */
export function SlidingDoorSymbol({ o, view }: { o: RoomObject; view: View }) {
  const s = o.type !== 'rack' && o.hinge === 'right' ? 1 : -1;
  const track = o.d / 2 + SLIDE_STANDOFF_M;
  const lap = SLIDE_OVERLAP_M;
  const arrowY = o.d / 2 + SLIDE_ARROW_M;
  const tip = s * o.w * 0.3;
  const tail = -tip;
  const head = o.w * 0.1;
  return (
    <g aria-hidden="true">
      <path className="door__jamb" d={`${path([pt(o, view, -o.w / 2, -o.d / 2), pt(o, view, -o.w / 2, o.d / 2)])} ${path([pt(o, view, o.w / 2, -o.d / 2), pt(o, view, o.w / 2, o.d / 2)])}`} />
      <path className="door__track" d={path([pt(o, view, -s * (o.w / 2), track), pt(o, view, s * (o.w / 2 + o.w), track)])} />
      <path className="door__leaf door__leaf--slide" d={path([pt(o, view, s * (o.w / 2 - lap), track), pt(o, view, s * (o.w / 2 - lap + o.w), track)])} />
      <path className="door__arrow" d={`${path([pt(o, view, tail, arrowY), pt(o, view, tip, arrowY)])} ${path([pt(o, view, tip - s * head, arrowY - head * 0.6), pt(o, view, tip, arrowY), pt(o, view, tip - s * head, arrowY + head * 0.6)])}`} />
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

/** Small electrical sources drawn as drafting symbols: plug, IEC socket, floor box; UPS and PDU get a front strip. */
export function SourceSymbol({ o, view }: { o: RoomObject; view: View }) {
  const s = (u: number, v: number) => pt(o, view, u * o.w, v * o.d);
  const [cx, cy] = s(0, 0);
  const r = Math.max(2, Math.min(o.w, o.d) * view.scale * 0.3);
  if (o.type === 'wall_plug') {
    return <path aria-hidden="true" className="src__mark" d={`${path([s(-0.18, -0.25), s(-0.18, 0.25)])} ${path([s(0.18, -0.25), s(0.18, 0.25)])}`} />;
  }
  if (o.type === 'industrial_socket') {
    const pins = [s(0, -0.22), s(-0.2, 0.15), s(0.2, 0.15)];
    return (
      <g aria-hidden="true">
        <circle className="src__mark" cx={cx} cy={cy} r={r} />
        {pins.map(([x, y], i) => (
          <circle key={i} className="src__pin" cx={x} cy={y} r={Math.max(1, r * 0.18)} />
        ))}
      </g>
    );
  }
  if (o.type === 'floor_box') {
    return (
      <g aria-hidden="true">
        <path className="src__mark" d={path([s(-0.5, 0.5), s(0.5, -0.5)])} />
        <circle className="src__mark" cx={cx} cy={cy} r={r} />
      </g>
    );
  }
  if (o.type === 'ups' || o.type === 'pdu') {
    return <path aria-hidden="true" className="src__front" d={path([s(-0.5, 0.42), s(0.5, 0.42)])} />;
  }
  return null;
}
