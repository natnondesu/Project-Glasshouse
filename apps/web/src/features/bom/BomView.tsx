import { BOM_COLUMNS, bomCsv, bomRows, currentRevision, EQUIPMENT_STATE_LABEL, EQUIPMENT_STATES, type EquipmentState, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { downloadText, slugify } from '../../ui/files';
import { pad2 } from '../../ui/StatusStamp';
import './bom.css';

const VISIBLE = BOM_COLUMNS.filter((c) => c.key !== 'project' && c.key !== 'site' && c.key !== 'room');
const NOWRAP = new Set<string>(['rack', 'chassis', 'slot', 'name', 'position', 'heightU', 'depthMm', 'demandW']);

export function BomView({ location }: { location: RoomLocation }) {
  const all = useMemo(() => bomRows(location), [location]);
  const [filter, setFilter] = useState<EquipmentState | 'all'>('all');
  // The CSV follows the filter, so "what's still to install" is one click away.
  const rows = filter === 'all' ? all : all.filter((r) => r.state === EQUIPMENT_STATE_LABEL[filter]);
  const revision = currentRevision(location.room.plan);

  const download = (): void =>
    // The UTF-8 byte-order mark makes Excel read en dashes and Thai text correctly.
    downloadText(`${slugify(location.room.name)}-R${pad2(revision.number)}-bom.csv`, `\uFEFF${bomCsv(rows)}`, 'text/csv;charset=utf-8');

  return (
    <section className="bom glass" aria-labelledby="bom-h">
      <header className="bom__head">
        <h2 id="bom-h">Devices &amp; BOM</h2>
        <span className="bom__count">{`${rows.length} ${rows.length === 1 ? 'Device' : 'Devices'}, each Node listed separately`}</span>
        <button type="button" className="btn btn--ink" onClick={download} disabled={rows.length === 0}>
          Download CSV
        </button>
      </header>
      {all.length > 0 ? (
        <div className="seg seg--compact bom__filter" role="group" aria-label="Show equipment">
          {(['all', ...EQUIPMENT_STATES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : EQUIPMENT_STATE_LABEL[s]}
            </button>
          ))}
        </div>
      ) : null}
      {rows.length === 0 && all.length > 0 ? <p className="bom__empty">Nothing in this state.</p> : null}
      {all.length === 0 ? (
        <p className="bom__empty">No Devices yet. Add them on the Elevation tab.</p>
      ) : (
        <div className="bom__scroll">
          <table className="bom__table">
            <thead>
              <tr>
                {VISIBLE.map((c) => (
                  <th key={c.key} scope="col">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.rack}-${r.name}-${i}`} className={`bom__row bom__row--${r.kind.toLowerCase()}`}>
                  {VISIBLE.map((c) => (
                    <td key={c.key} className={NOWRAP.has(c.key) ? 'mono bom__nowrap' : undefined}>
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
