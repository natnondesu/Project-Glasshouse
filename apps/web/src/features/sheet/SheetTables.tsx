import { BOM_COLUMNS, effectiveHeight, formatDemand, formatMetres, formatURange, isWallHung, keepClearOf, panelOf, racksOf, wallBottomOf, wayPhase, type BomRow, type Chassis, type Rack, type Revision, type CableRow, type PlanContent, type RoomObject } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { useT, type Messages } from '../../i18n';
import { usePeople } from '../../people/peopleStore';
import { personLabel } from '../../ui/person';
import { bomCell, bomHeader } from '../bom/bomText';
import { vlanUsage } from '../network/vlanUsage';

// The sheet prints the approved design on A4: on-site state is live (it's on the elevations) and the
// title block already names the project, site and room. Height is in Position (U1–U4), so it isn't repeated.
const SHEET_COLUMNS = BOM_COLUMNS.filter((c) => !['project', 'site', 'room', 'kind', 'state', 'heightU'].includes(c.key));
// Figures and U ranges stay on one line; names and racks may wrap at their hyphens so a big room still fits the page.
const SHORT = new Set<string>(['slot', 'position', 'heightU', 'depthMm', 'demandW']);
/**
 * Fixed column shares (percent of the page): auto widths let one long cell (a trunk list, a LAG port)
 * widen its column for every row and push the table off A4.
 */
const BOM_WIDTHS: Partial<Record<string, number>> = { rack: 10, chassis: 10, slot: 4, name: 13, model: 13, category: 8, position: 7, depthMm: 5, demandW: 6, ports: 8, config: 11, notes: 5 };
const CABLE_WIDTHS = [12, 23, 12, 23, 11, 8, 11];
const FITTING_WIDTHS = [11, 17, 15, 11, 28, 18];

/** What the sheet lists besides racks and power: things that stand or hang in the room and need a place, a height and sometimes space kept clear. */
const FITTING_TYPES = new Set<RoomObject['type']>(['partition', 'wall_split_ac', 'precision_ac', 'display_wall']);
export const fittingsOf = (content: PlanContent): RoomObject[] => content.objects.filter((o) => FITTING_TYPES.has(o.type));

/**
 * Long tables carry the title block in <thead>: browsers repeat <thead> on every printed page,
 * so a page that a table spills onto still has its title block (FR12 item 1).
 */
function TitleHead({ span, titleBlock, children }: { span: number; titleBlock: ReactNode; children: ReactNode }) {
  return (
    <thead>
      <tr className="sheet-table__title">
        <td colSpan={span}>{titleBlock}</td>
      </tr>
      {children}
    </thead>
  );
}

export function SlotMapsTable({ chassis, titleBlock }: { chassis: { rack: Rack; chassis: Chassis }[]; titleBlock: ReactNode }) {
  const m = useT();
  return (
    <table className="sheet-table" aria-label={m.sheet.slotMaps}>
      <TitleHead span={4} titleBlock={titleBlock}>
        <tr>
          <th scope="col">{m.sheet.slot}</th>
          <th scope="col">{m.sheet.node}</th>
          <th scope="col">{m.sheet.demand}</th>
          <th scope="col">{m.sheet.config}</th>
        </tr>
      </TitleHead>
      {chassis.map(({ rack, chassis: c }) => (
        <tbody key={c.id} aria-label={m.sheet.slotMapOf(c.name)}>
          <tr className="sheet-table__group">
            <th colSpan={4} scope="rowgroup">{m.sheet.chassisLine(c.name, rack.name, formatURange(c), c.slotCount)}</th>
          </tr>
          {Array.from({ length: c.slotCount }, (_, i) => {
            const node = c.nodes.find((n) => n.slot === i + 1);
            return (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td>{node ? node.name : <span className="sheet-empty">{m.sheet.empty}</span>}</td>
                <td className="mono">{node ? formatDemand(node.demand) : ''}</td>
                <td>{node?.config ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

function acknowledged(revision: Revision) {
  const ranges = racksOf(revision.content).flatMap((rack) => rack.reserved.map((range) => ({ rack, range })));
  return revision.acknowledgements.flatMap((a) => {
    const hit = ranges.find((x) => x.range.id === a.reservedRangeId);
    return hit ? [{ ...hit, ack: a }] : [];
  });
}

/** Acknowledged unknowns live in the BOM table too, so they can never land on a page without a title block. */
export function BomTable({ rows, revision, titleBlock }: { rows: BomRow[]; revision: Revision; titleBlock: ReactNode }) {
  const m = useT();
  const people = usePeople();
  const acks = acknowledged(revision);
  return (
    <table className="sheet-table sheet-table--bom sheet-table--fixed" aria-label={m.sheet.bom}>
      <colgroup>
        {SHEET_COLUMNS.map((c) => (
          <col key={c.key} style={{ width: `${BOM_WIDTHS[c.key] ?? 100 / SHEET_COLUMNS.length}%` }} />
        ))}
      </colgroup>
      <TitleHead span={SHEET_COLUMNS.length} titleBlock={titleBlock}>
        <tr>
          {SHEET_COLUMNS.map((c) => (
            <th key={c.key} scope="col">
              {bomHeader(m, c.key)}
            </th>
          ))}
        </tr>
      </TitleHead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.kind === 'Node' ? 'is-node' : undefined}>
            {SHEET_COLUMNS.map((c) => (
              <td key={c.key} className={SHORT.has(c.key) ? 'is-short' : undefined}>
                {bomCell(m, r, c.key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {revision.content.feeds.length > 0 ? (
        <tbody aria-label={m.sheet.powerFeeds}>
          <tr className="sheet-table__group">
            <th colSpan={SHEET_COLUMNS.length} scope="rowgroup">
              {m.sheet.powerFeeds}
            </th>
          </tr>
          {[...revision.content.feeds]
            .map((f) => {
              const source = revision.content.objects.find((o) => o.id === f.sourceId);
              const way = source && source.type === 'mcb' && f.way ? panelOf(source).ways[f.way - 1] : undefined;
              const where = way && source && f.way ? m.sheet.wayDetail(f.way, wayPhase(panelOf(source), f.way), way.ratingA) : '';
              return { f, rack: revision.content.objects.find((o) => o.id === f.targetId)?.name ?? '', panel: `${source?.name ?? ''}${where}` };
            })
            .sort((a, b) => a.rack.localeCompare(b.rack) || a.f.label.localeCompare(b.f.label))
            .map(({ f, rack, panel }) => (
              <tr key={f.id}>
                <td>{rack}</td>
                <td>{f.label}</td>
                <td colSpan={SHEET_COLUMNS.length - 2}>{panel}</td>
              </tr>
            ))}
        </tbody>
      ) : null}
      {acks.length > 0 ? (
        <tbody aria-label={m.sheet.acknowledged}>
          <tr className="sheet-table__group">
            <th colSpan={SHEET_COLUMNS.length} scope="rowgroup">
              {m.sheet.acknowledged}
            </th>
          </tr>
          {acks.map(({ rack, range, ack }) => (
            <tr key={range.id}>
              <td colSpan={SHEET_COLUMNS.length}>
                <strong>{`${range.label} · ${formatURange(range)} · ${rack.name}`}</strong>
                {m.sheet.ackLine(ack.reason, personLabel(m, ack.by, people))}
              </td>
            </tr>
          ))}
        </tbody>
      ) : null}
    </table>
  );
}

/** Every cable as a row an installer can tick off: label, both ends, and the cable to pull. */
export function CableScheduleTable({ rows, titleBlock }: { rows: CableRow[]; titleBlock: ReactNode }) {
  const m = useT();
  return (
    <table className="sheet-table sheet-cables sheet-table--fixed" aria-label={m.sheet.cableSchedule}>
      <colgroup>
        {CABLE_WIDTHS.map((w, i) => (
          <col key={i} style={{ width: `${w}%` }} />
        ))}
      </colgroup>
      <TitleHead span={7} titleBlock={titleBlock}>
        <tr>
          <th scope="col">{m.sheet.cable.label}</th>
          <th scope="col">{m.sheet.cable.from}</th>
          <th scope="col">{m.sheet.cable.port}</th>
          <th scope="col">{m.sheet.cable.to}</th>
          <th scope="col">{m.sheet.cable.port}</th>
          <th scope="col">{m.sheet.cable.cable}</th>
          <th scope="col">{m.sheet.cable.vlan}</th>
        </tr>
      </TitleHead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="mono is-short">{r.label || <span className="sheet-empty">{m.sheet.unlabelled}</span>}</td>
            <End device={r.from.device} rack={r.from.rack} />
            <td className="mono">{r.from.port}</td>
            <End device={r.to.device} rack={r.to.rack} />
            <td className="mono">{r.to.port}</td>
            <td className="is-short">{r.cable}</td>
            <td className="mono">{r.vlan}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One end of a cable: the device, and the rack to find it in under it. Names wrap at their hyphens rather than widen the page. */
function End({ device, rack }: { device: string; rack: string }) {
  return (
    <td className="sheet-cables__end">
      <span className="mono">{device}</span>
      <span className="sheet-cables__rack mono">{rack}</span>
    </td>
  );
}

/** The room's VLANs under the network diagram. Short, so it never needs a repeating title block. */
export function VlanTable({ content }: { content: PlanContent }) {
  const m = useT();
  const usage = vlanUsage(content);
  return (
    <table className="sheet-table sheet-vlans" aria-label={m.vlans.title}>
      <thead>
        <tr>
          <th scope="col">{m.vlans.vid}</th>
          <th scope="col">{m.vlans.name}</th>
          <th scope="col">{m.vlans.ports}</th>
        </tr>
      </thead>
      <tbody>
        {content.vlans.map((v) => (
          <tr key={v.vid}>
            <td className="mono is-short">{v.vid}</td>
            <td>{v.name}</td>
            <td className="mono is-short">{m.vlans.usedBy(usage.get(v.vid) ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The default depth reads plainly; a depth someone set is marked, so an exception shows to reviewers and installers. */
function keepClearText(m: Messages, o: RoomObject, depth: number): string {
  const isSet = o.type !== 'rack' && o.keepClearM !== undefined;
  if (depth === 0) return m.sheet.fittings.clearNone;
  const zone = m.plan.zone[o.type as keyof typeof m.plan.zone];
  return isSet ? m.sheet.fittings.clearSet(zone, formatMetres(depth)) : `${zone} ${formatMetres(depth)} m`;
}

/** Partitions, air conditioning and display walls: where each one is fixed, how big, how high, and the space to leave in front of it. */
export function FittingsTable({ objects, titleBlock }: { objects: RoomObject[]; titleBlock: ReactNode }) {
  const m = useT();
  return (
    <table className="sheet-table sheet-table--fixed" aria-label={m.sheet.fittings.title}>
      <colgroup>
        {FITTING_WIDTHS.map((w, i) => (
          <col key={i} style={{ width: `${w}%` }} />
        ))}
      </colgroup>
      <TitleHead span={6} titleBlock={titleBlock}>
        <tr>
          <th scope="col">{m.sheet.fittings.name}</th>
          <th scope="col">{m.sheet.fittings.type}</th>
          <th scope="col">{m.sheet.fittings.size}</th>
          <th scope="col">{m.sheet.fittings.height}</th>
          <th scope="col">{m.sheet.fittings.fixing}</th>
          <th scope="col">{m.sheet.fittings.clear}</th>
        </tr>
      </TitleHead>
      <tbody>
        {objects.map((o) => {
          const depth = keepClearOf(o);
          return (
            <tr key={o.id}>
              <td className="mono">{o.name}</td>
              <td>{m.objects.type[o.type]}</td>
              <td className="mono is-short">{`${formatMetres(o.w)} × ${formatMetres(o.d)}`}</td>
              <td className="mono is-short">{formatMetres(effectiveHeight(o))}</td>
              <td>{isWallHung(o) ? m.sheet.fittings.onWall(formatMetres(wallBottomOf(o))) : m.sheet.fittings.onFloor}</td>
              <td className="mono">{depth === null ? '' : keepClearText(m, o, depth)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
