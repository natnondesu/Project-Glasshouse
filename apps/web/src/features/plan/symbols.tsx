import { localToWorld, type RoomObject } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';

const ARC_STEPS = 18;
/** Sockets drawn on a power bar in plan. */
const PDU_SOCKETS = 6;
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
  if (o.type === 'pdu') {
    // A power bar from above: a row of sockets along it.
    const n = PDU_SOCKETS;
    return (
      <g aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const [x, y] = s(-0.4 + (0.8 * i) / (n - 1), 0);
          return <circle key={i} className="src__pin" cx={x} cy={y} r={Math.max(1, r * 0.22)} />;
        })}
      </g>
    );
  }
  if (o.type === 'ups') {
    return <path aria-hidden="true" className="src__front" d={path([s(-0.5, 0.42), s(0.5, 0.42)])} />;
  }
  return null;
}

/** Metres of drawn airflow, and how many streams, from the front of a wall split AC. */
const AC_FLOW_M = 0.3;
const AC_FLOW_STREAMS = 3;
const AC_FLOW_MIN_PX = 14;
const ARROW_HEAD_PX = 4;

/**
 * Wall split AC: the indoor unit's vent slot along its front, and the air it blows into the room as arrows from the front face.
 * The arrows are what the airflow zone is about; they go once there is room for them at this zoom.
 */
export function WallSplitAcSymbol({ o, view }: { o: RoomObject; view: View }) {
  const vent = o.d / 2 - Math.min(0.06, o.d * 0.25);
  const flowPx = AC_FLOW_M * view.scale;
  return (
    <g aria-hidden="true">
      <path className="ac__louvre" d={path([pt(o, view, -o.w / 2 + 0.07, vent), pt(o, view, o.w / 2 - 0.07, vent)])} />
      {flowPx >= AC_FLOW_MIN_PX
        ? Array.from({ length: AC_FLOW_STREAMS }, (_, i) => {
            const u = (o.w * (i - (AC_FLOW_STREAMS - 1) / 2)) / AC_FLOW_STREAMS;
            const [tx, ty] = pt(o, view, u, o.d / 2 + 0.03);
            const [hx, hy] = pt(o, view, u, o.d / 2 + 0.03 + AC_FLOW_M);
            const [ux, uy] = [(hx - tx) / (Math.hypot(hx - tx, hy - ty) || 1), (hy - ty) / (Math.hypot(hx - tx, hy - ty) || 1)];
            const [nx, ny] = [-uy, ux];
            return (
              <path
                key={i}
                className="ac__flow"
                d={`${path([[tx, ty], [hx, hy]])} ${path([[hx - ux * ARROW_HEAD_PX + nx * ARROW_HEAD_PX * 0.6, hy - uy * ARROW_HEAD_PX + ny * ARROW_HEAD_PX * 0.6], [hx, hy], [hx - ux * ARROW_HEAD_PX - nx * ARROW_HEAD_PX * 0.6, hy - uy * ARROW_HEAD_PX - ny * ARROW_HEAD_PX * 0.6]])}`}
              />
            );
          })
        : null}
    </g>
  );
}

/** Radius of a precision AC's fan, as a share of its smaller side. */
export const PAC_FAN_SHARE = 0.2;
/** The fan sits above the middle of the cabinet and the name under it; both are measured on screen, so they stay clear when it is turned. */
const PAC_FAN_LIFT_SHARE = 0.14;
const PAC_NAME_DROP_SHARE = 0.16;
const FAN_BLADES = 4;
const BLADE_SWEEP_DEG = 38;

/** Where the name of a precision AC goes, in pixels below the middle of the cabinet. */
export const pacNameDropPx = (o: RoomObject, view: View): number => Math.min(o.w, o.d) * view.scale * PAC_NAME_DROP_SHARE;

/** Precision AC: the fan seen from above and a heavy band along the front, the face people service it from. */
export function PrecisionAcSymbol({ o, view }: { o: RoomObject; view: View }) {
  const [mx, my] = pt(o, view, 0, 0);
  const size = Math.min(o.w, o.d) * view.scale;
  const [cx, cy] = [mx, my - size * PAC_FAN_LIFT_SHARE];
  const r = size * PAC_FAN_SHARE;
  const rim = (deg: number): [number, number] => [cx + Math.cos((deg * Math.PI) / 180) * r * 0.9, cy + Math.sin((deg * Math.PI) / 180) * r * 0.9];
  const blades = Array.from({ length: FAN_BLADES }, (_, i) => {
    const from = (360 / FAN_BLADES) * i - 90;
    const [ax, ay] = rim(from);
    const [bx, by] = rim(from + BLADE_SWEEP_DEG);
    return `M${cx.toFixed(1)} ${cy.toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)} A${(r * 0.9).toFixed(1)} ${(r * 0.9).toFixed(1)} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)} Z`;
  });
  return (
    <g aria-hidden="true">
      <circle className="pac__fan" cx={cx} cy={cy} r={r} />
      <path className="pac__blades" d={blades.join(' ')} />
      <path className="src__front" d={path([pt(o, view, -o.w * 0.42, o.d * 0.42), pt(o, view, o.w * 0.42, o.d * 0.42)])} />
    </g>
  );
}

/** One display tile is about this wide. */
const DISPLAY_TILE_M = 1;

/** Display wall: tile joints across the panel and a heavy screen face on the front, where people look from. */
export function DisplayWallSymbol({ o, view }: { o: RoomObject; view: View }) {
  const tiles = Math.max(2, Math.round(o.w / DISPLAY_TILE_M));
  return (
    <g aria-hidden="true">
      {Array.from({ length: tiles - 1 }, (_, i) => {
        const u = -o.w / 2 + (o.w * (i + 1)) / tiles;
        return <path key={i} className="dw__tile" d={path([pt(o, view, u, -o.d / 2), pt(o, view, u, o.d / 2)])} />;
      })}
      <path className="dw__screen" d={path([pt(o, view, -o.w / 2, o.d / 2), pt(o, view, o.w / 2, o.d / 2)])} />
    </g>
  );
}

/** Text lying along an object's long side, upright whichever way it is turned. */
export function AlongLabel({ o, view, text, side = 'up', gapPx, className = '' }: { o: RoomObject; view: View; text: string; side?: 'up' | 'front'; gapPx: number; className?: string }) {
  const [cx, cy] = pt(o, view, 0, 0);
  const [ex, ey] = pt(o, view, 1, 0);
  let turn = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI;
  // Upright, and vertical text reads from the bottom up, as the dimension figures do.
  if (turn >= 90) turn -= 180;
  if (turn < -90) turn += 180;
  const rad = (turn * Math.PI) / 180;
  // Perpendicular to the text: 'up' is the side the text's top faces; 'front' the side the object faces.
  const [fx, fy] = pt(o, view, 0, 1);
  const front: [number, number] = [fx - cx, fy - cy];
  const up: [number, number] = [Math.sin(rad), -Math.cos(rad)];
  const [dx, dy] = side === 'front' ? [front[0] / (Math.hypot(...front) || 1), front[1] / (Math.hypot(...front) || 1)] : up;
  return (
    <text className={`obj__label obj__label--along ${className}`.trim()} x={cx + dx * gapPx} y={cy + dy * gapPx} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${turn.toFixed(2)} ${(cx + dx * gapPx).toFixed(1)} ${(cy + dy * gapPx).toFixed(1)})`}>
      {text}
    </text>
  );
}
