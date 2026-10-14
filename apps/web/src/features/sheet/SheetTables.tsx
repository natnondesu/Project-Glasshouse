import { BOM_COLUMNS, formatDemand, formatURange, panelOf, racksOf, wayPhase, type BomRow, type Chassis, type Rack, type Revision, type CableRow } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { bomCell, bomHeader } from '../bom/bomText';

// The sheet prints the approved design on A4: on-site state is live (it's on the elevations) and the
// title block already names the project, site and room.
const SHEET_COLUMNS = BOM_COLUMNS.filter((c) => !['project', 'site', 'room', 'kind', 'state'].includes(c.key));
const SHORT = new Set<string>(['rack', 'chassis', 'slot', 'name', 'position', 'heightU', 'depthMm', 'demandW']);

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
  const acks = acknowledged(revision);
  return (
    <table className="sheet-table sheet-table--bom" aria-label={m.sheet.bom}>
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
                <td className="is-short">{rack}</td>
                <td className="is-short">{f.label}</td>
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
                {m.sheet.ackLine(ack.reason, ack.by.name)}
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
    <table className="sheet-table" aria-label={m.sheet.cableSchedule}>
      <TitleHead span={8} titleBlock={titleBlock}>
        <tr>
          <th scope="col">{m.sheet.cable.label}</th>
          <th scope="col">{m.sheet.cable.fromRack}</th>
          <th scope="col">{m.sheet.cable.fromDevice}</th>
          <th scope="col">{m.sheet.cable.port}</th>
          <th scope="col">{m.sheet.cable.toRack}</th>
          <th scope="col">{m.sheet.cable.toDevice}</th>
          <th scope="col">{m.sheet.cable.port}</th>
          <th scope="col">{m.sheet.cable.cable}</th>
        </tr>
      </TitleHead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="mono is-short">{r.label || <span className="sheet-empty">{m.sheet.unlabelled}</span>}</td>
            <td className="mono is-short">{r.from.rack}</td>
            <td className="mono is-short">{r.from.device}</td>
            <td className="mono is-short">{r.from.port}</td>
            <td className="mono is-short">{r.to.rack}</td>
            <td className="mono is-short">{r.to.device}</td>
            <td className="mono is-short">{r.to.port}</td>
            <td>{r.cable}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
