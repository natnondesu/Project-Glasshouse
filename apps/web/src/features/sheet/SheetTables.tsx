import { BOM_COLUMNS, formatDemand, formatURange, racksOf, type BomRow, type Chassis, type Revision } from '@glasshouse/domain';
import type { ReactNode } from 'react';

const SHEET_COLUMNS = BOM_COLUMNS.filter((c) => !['project', 'site', 'room', 'category', 'kind'].includes(c.key));
const SHORT = new Set<string>(['rack', 'chassis', 'slot', 'name', 'position', 'heightU', 'depthMm', 'demandW']);

export function SlotMapTable({ chassis, rackName }: { chassis: Chassis; rackName: string }) {
  return (
    <table className="sheet-table" aria-label={`${chassis.name} slot map`}>
      <caption>{`${chassis.name} in ${rackName}, ${formatURange(chassis)} · ${chassis.slotCount} slots`}</caption>
      <thead>
        <tr>
          <th scope="col">Slot</th>
          <th scope="col">Node</th>
          <th scope="col">Demand</th>
          <th scope="col">Configuration</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: chassis.slotCount }, (_, i) => {
          const node = chassis.nodes.find((n) => n.slot === i + 1);
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
    </table>
  );
}

/** The title block sits in <thead> so browsers repeat it on every printed page of a long BOM. */
export function BomTable({ rows, titleBlock }: { rows: BomRow[]; titleBlock: ReactNode }) {
  return (
    <table className="sheet-table sheet-table--bom" aria-label="Bill of materials">
      <thead>
        <tr className="sheet-table__title">
          <td colSpan={SHEET_COLUMNS.length}>{titleBlock}</td>
        </tr>
        <tr>
          {SHEET_COLUMNS.map((c) => (
            <th key={c.key} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
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
    </table>
  );
}

export function AcknowledgedUnknowns({ revision }: { revision: Revision }) {
  const ranges = racksOf(revision.content).flatMap((rack) => rack.reserved.map((range) => ({ rack, range })));
  const acks = revision.acknowledgements.flatMap((a) => {
    const hit = ranges.find((x) => x.range.id === a.reservedRangeId);
    return hit ? [{ ...hit, ack: a }] : [];
  });
  if (acks.length === 0) return null;
  return (
    <section className="sheet-acks" aria-labelledby="acks-h">
      <h3 id="acks-h">Acknowledged unknowns</h3>
      <ul>
        {acks.map(({ rack, range, ack }) => (
          <li key={range.id}>
            <strong>{`${range.label} · ${formatURange(range)} · ${rack.name}`}</strong>
            {`: ${ack.reason} — accepted by ${ack.by.name} (unverified)`}
          </li>
        ))}
      </ul>
    </section>
  );
}
