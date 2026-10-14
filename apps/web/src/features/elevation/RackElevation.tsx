import { EQUIPMENT_STATE_LABEL, formatDemand, formatURange, type EquipmentState, rackPower, topU, usedU, type Chassis, type Rack, type RackDevice, type ReservedRange } from '@glasshouse/domain';
import type { DragEvent, KeyboardEvent } from 'react';
import { TEMPLATE_MIME } from './dnd';
import { STATE_SYMBOL } from './EquipmentStateControl';
import './elevation.css';
import '../search/search.css';

export const U_PX = 16;
const LABEL_W = 24;
const RACK_W = 200;
const PAD = 2;
const PLANNED = (): EquipmentState => 'planned';
const STATE_X = 13;
const NAME_X = 23;
const NAME_CHAR_PX = 7.3;
const SUB_CHAR_PX = 6.7;
/** Room for a name left of the wattage, and left of a chassis's slot cells. */
const DEVICE_NAME_PX = RACK_W - 80;
const CHASSIS_NAME_PX = 50;

/** Shortens text to fit `px` at a monospace character width; the full text is in the block's <title>. */
function fitText(text: string, px: number, charPx = NAME_CHAR_PX): string {
  const max = Math.floor(px / charPx);
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

interface RackElevationProps {
  rack: Rack;
  active: boolean;
  selectedId: string | null;
  flagged: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onActivate: () => void;
  onDropTemplate: (templateId: string, bottomU: number) => void;
  /** Print: no controls, only the drawing. */
  isStatic?: boolean;
  /** Device, node or reserved range to flash after a search jump. */
  pulseId?: string | null;
  /** On-site state per device or node; absent means planned. */
  stateOf?: (id: string) => EquipmentState;
}

const categoryOf = (d: RackDevice): string => (d.kind === 'chassis' ? 'chassis' : d.category);

function ChassisSlots({ chassis, y, onSelect, stateOf }: { chassis: Chassis; y: number; onSelect: ((id: string) => void) | null; stateOf: (id: string) => EquipmentState }) {
  const left = 66;
  const right = RACK_W - 12;
  const top = y + 5;
  const bottom = y + chassis.heightU * U_PX - 5;
  const gap = 3;
  const cols = chassis.slotsPerRow;
  const rows = Math.ceil(chassis.slotCount / cols);
  const w = (right - left - gap * (cols - 1)) / cols;
  const h = (bottom - top - gap * (rows - 1)) / rows;
  return (
    <g>
      {Array.from({ length: chassis.slotCount }, (_, i) => {
        const slot = i + 1;
        const node = chassis.nodes.find((n) => n.slot === slot);
        const x = left + (i % cols) * (w + gap);
        const cy = top + Math.floor(i / cols) * (h + gap);
        const cls = node ? `${node.demand.kind === 'unknown' ? 'slot-cell slot-cell--unknown' : 'slot-cell slot-cell--filled'} slot-cell--state-${stateOf(node.id)}` : 'slot-cell';
        return (
          <g
            key={slot}
            data-elev-id={node?.id}
            onClick={
              node && onSelect
                ? (e) => {
                    e.stopPropagation();
                    onSelect(node.id);
                  }
                : undefined
            }
          >
            <rect x={x} y={cy} width={w} height={h} rx={2} className={cls}>
              <title>{node ? `Slot ${slot}: ${node.name}` : `Slot ${slot}: empty`}</title>
            </rect>
            <text x={x + w / 2} y={cy + h / 2 + 4} textAnchor="middle" className="slot-cell__n">
              {node && node.demand.kind === 'unknown' ? '?' : slot}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Interactive attributes for a block, or none on paper. */
function control(isStatic: boolean, label: string, selected: boolean, onClick: () => void, onKey: (e: KeyboardEvent) => void) {
  return isStatic ? {} : { role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': selected, onClick, onKeyDown: onKey };
}

function DeviceBlock(props: { device: RackDevice; y: number; selected: boolean; flagged: boolean; onSelect: (id: string) => void; onKey: (e: KeyboardEvent) => void; isStatic: boolean; pulse: boolean; state: EquipmentState; stateOf: (id: string) => EquipmentState }) {
  const { device, y, selected, flagged, onSelect, onKey, isStatic, pulse, state, stateOf } = props;
  const h = device.heightU * U_PX;
  const textY = y + Math.min(h, 32) / 2 + 4;
  const classes = ['dev', `dev--${categoryOf(device)}`, selected ? 'is-selected' : '', flagged ? 'is-flagged' : ''].filter(Boolean).join(' ');
  return (
    <g className={`${classes} dev--state-${state}${pulse ? ' is-search-pulse' : ''}`} data-elev-id={device.id} {...control(isStatic, `${device.name}, ${formatURange(device)}`, selected, () => onSelect(device.id), onKey)}>
      <title>{`${device.name}, ${formatURange(device)} · ${EQUIPMENT_STATE_LABEL[state]}`}</title>
      <rect x={4} y={y + 1} width={RACK_W - 8} height={h - 2} rx={3} className="dev__body" />
      <text x={STATE_X} y={textY} className="dev__state" textAnchor="middle">
        {STATE_SYMBOL[state]}
      </text>
      <text x={NAME_X} y={textY} className="dev__name">
        {fitText(device.name, (device.kind === 'chassis' ? CHASSIS_NAME_PX : DEVICE_NAME_PX) - (NAME_X - 12))}
      </text>
      {device.kind === 'chassis' ? (
        <ChassisSlots chassis={device} y={y} onSelect={isStatic ? null : onSelect} stateOf={stateOf} />
      ) : (
        <text x={RACK_W - 12} y={textY} textAnchor="end" className="dev__w">
          {formatDemand(device.demand)}
        </text>
      )}
    </g>
  );
}

function ReservedBlock(props: { range: ReservedRange; y: number; patternId: string; selected: boolean; onSelect: (id: string) => void; onKey: (e: KeyboardEvent) => void; isStatic: boolean; pulse: boolean }) {
  const { range, y, patternId, selected, onSelect, onKey, isStatic, pulse } = props;
  const h = range.heightU * U_PX;
  const midY = y + h / 2;
  return (
    <g className={`rsv${selected ? ' is-selected' : ''}${pulse ? ' is-search-pulse' : ''}`} data-elev-id={range.id} {...control(isStatic, `Reserved range ${formatURange(range)}, ${range.label}`, selected, () => onSelect(range.id), onKey)}>
      <title>{`Reserved range ${formatURange(range)}, ${range.label}`}</title>
      <rect x={4} y={y + 1} width={RACK_W - 8} height={h - 2} rx={3} fill={`url(#${patternId})`} className="rsv__body" />
      {h >= 48 ? (
        <>
          <rect x={14} y={midY - 22} width={RACK_W - 28} height={44} rx={8} className="rsv__label-bg" />
          <text x={RACK_W / 2} y={midY - 6} textAnchor="middle" className="rsv__title">
            {`RESERVED · ${formatURange(range)}`}
          </text>
          <text x={RACK_W / 2} y={midY + 12} textAnchor="middle" className="rsv__sub">
            {fitText(`${range.label} · ${formatDemand(range.demand)}`, RACK_W - 40, SUB_CHAR_PX)}
          </text>
        </>
      ) : (
        <text x={12} y={y + Math.min(h, 32) / 2 + 4} className="rsv__sub">
          {fitText(`${range.label} · ${formatURange(range)}`, RACK_W - 24, SUB_CHAR_PX)}
        </text>
      )}
    </g>
  );
}

export function RackElevation({ rack, active, selectedId, flagged, onSelect, onActivate, onDropTemplate, isStatic = false, pulseId = null, stateOf = PLANNED }: RackElevationProps) {
  const height = rack.capacityU * U_PX;
  const yTop = (top: number): number => PAD + (rack.capacityU - top) * U_PX;
  const power = rackPower(rack);
  const knownW = power.devices.knownW + power.reserved.knownW;
  const unknown = power.devices.unknownCount + power.reserved.unknownCount;
  const patternId = `rsv-${rack.id}`;
  const units = Array.from({ length: rack.capacityU }, (_, i) => rack.capacityU - i);

  const keySelect = (id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onSelect(id);
  };
  const onDragOver = (e: DragEvent<SVGSVGElement>): void => {
    if (!e.dataTransfer.types.includes(TEMPLATE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent<SVGSVGElement>): void => {
    const templateId = e.dataTransfer.getData(TEMPLATE_MIME);
    if (!templateId) return;
    e.preventDefault();
    const top = e.currentTarget.getBoundingClientRect().top;
    const u = rack.capacityU - Math.floor((e.clientY - top - PAD) / U_PX);
    onDropTemplate(templateId, Math.min(rack.capacityU, Math.max(1, u)));
  };

  return (
    <figure className={`rack-elev${active ? ' is-active' : ''}`}>
      <figcaption className="rack-elev__cap">
        {isStatic ? (
          <span className="rack-elev__name mono">{rack.name}</span>
        ) : (
          <button type="button" className="rack-elev__name mono" aria-pressed={active} onClick={onActivate}>
            {rack.name}
          </button>
        )}
        <span className="rack-elev__meta">
          {rack.owner === 'customer' ? 'Customer' : 'OxygenAI'} · <span className="mono">{`${usedU(rack)}/${rack.capacityU}U`}</span> ·{' '}
          <span className="mono">{`${knownW.toLocaleString('en-US')} W${unknown ? ` + ${unknown} unknown` : ''}`}</span>
        </span>
        <span className="rack-elev__depth mono">usable depth {rack.usableDepthMm} mm</span>
      </figcaption>
      <svg
        className="rack-elev__svg"
        width={LABEL_W * 2 + RACK_W}
        height={height + PAD * 2}
        viewBox={`0 0 ${LABEL_W * 2 + RACK_W} ${height + PAD * 2}`}
        role="group" aria-label={`${rack.name} front elevation, ${rack.capacityU}U`} onDragOver={onDragOver} onDrop={onDrop}>
        <defs>
          <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0V8" className="rsv-hatch" />
          </pattern>
        </defs>
        <rect x={LABEL_W} y={PAD} width={RACK_W} height={height} className="rack-frame__fill" />
        {units.map((u) => (
          <g key={u} aria-hidden="true">
            <line x1={LABEL_W} x2={LABEL_W + RACK_W} y1={yTop(u) + U_PX} y2={yTop(u) + U_PX} className="u-line" />
            <text x={LABEL_W - 8} y={yTop(u) + 12} textAnchor="end" className={u === 1 || u % 5 === 0 ? 'u-label u-label--major' : 'u-label'}>
              {u}
            </text>
            <text x={LABEL_W + RACK_W + 8} y={yTop(u) + 12} className={u === 1 || u % 5 === 0 ? 'u-label u-label--major' : 'u-label'}>
              {u}
            </text>
          </g>
        ))}
        <rect x={LABEL_W} y={PAD} width={RACK_W} height={height} className="rack-frame" />
        <g transform={`translate(${LABEL_W} 0)`}>
          {rack.reserved.map((r) => (
            <ReservedBlock key={r.id} range={r} y={yTop(topU(r))} patternId={patternId} selected={r.id === selectedId} onSelect={onSelect} onKey={keySelect(r.id)} isStatic={isStatic} pulse={r.id === pulseId} />
          ))}
          {rack.devices.map((d) => (
            <DeviceBlock key={d.id} device={d} y={yTop(topU(d))} selected={d.id === selectedId} flagged={flagged.has(d.id)} onSelect={onSelect} onKey={keySelect(d.id)} isStatic={isStatic} pulse={d.id === pulseId || (d.kind === 'chassis' && d.nodes.some((n) => n.id === pulseId))} state={stateOf(d.id)} stateOf={stateOf} />
          ))}
        </g>
      </svg>
    </figure>
  );
}
