import { BOM_COLUMNS, formatDemand, formatURange, racksOf, type BomRow, type Chassis, type Rack, type Revision } from '@glasshouse/domain';
import type { ReactNode } from 'react';

const SHEET_COLUMNS = BOM_COLUMNS.filter((c) => !['project', 'site', 'room', 'kind'].includes(c.key));
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
  return (
    <table className="sheet-table" aria-label="Slot maps">
      <TitleHead span={4} titleBlock={titleBlock}>
        <tr>
          <th scope="col">Slot</th>
          <th scope="col">Node</th>
          <th scope="col">Demand</th>
          <th scope="col">Configuration</th>
        </tr>
      </TitleHead>
      {chassis.map(({ rack, chassis: c }) => (
        <tbody key={c.id} aria-label={`${c.name} slot map`}>
          <tr className="sheet-table__group">
            <th colSpan={4} scope="rowgroup">{`${c.name} in ${rack.name}, ${formatURange(c)} · ${c.slotCount} slots`}</th>
          </tr>
          {Array.from({ length: c.slotCount }, (_, i) => {
            const node = c.nodes.find((n) => n.slot === i + 1);
            return (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td>{node ? node.name : <span className="sheet-empty">empty</span>}</td>
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
  const acks = acknowledged(revision);
  return (
    <table className="sheet-table sheet-table--bom" aria-label="Bill of materials">
      <TitleHead span={SHEET_COLUMNS.length} titleBlock={titleBlock}>
        <tr>
          {SHEET_COLUMNS.map((c) => (
            <th key={c.key} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </TitleHead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.kind === 'Node' ? 'is-node' : undefined}>
            {SHEET_COLUMNS.map((c) => (
              <td key={c.key} className={SHORT.has(c.key) ? 'is-short' : undefined}>
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {acks.length > 0 ? (
        <tbody aria-label="Acknowledged unknowns">
          <tr className="sheet-table__group">
            <th colSpan={SHEET_COLUMNS.length} scope="rowgroup">
              Acknowledged unknowns
            </th>
          </tr>
          {acks.map(({ rack, range, ack }) => (
            <tr key={range.id}>
              <td colSpan={SHEET_COLUMNS.length}>
                <strong>{`${range.label} · ${formatURange(range)} · ${rack.name}`}</strong>
                {`: ${ack.reason} — accepted by ${ack.by.name} (unverified)`}
              </td>
            </tr>
          ))}
        </tbody>
      ) : null}
    </table>
  );
}
