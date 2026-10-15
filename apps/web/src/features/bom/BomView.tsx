import { BOM_COLUMNS, bomCsv, bomRows, cableCsv, cableSchedule, currentRevision, EQUIPMENT_STATE_LABEL, EQUIPMENT_STATES, type EquipmentState, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { downloadText, slugify } from '../../ui/files';
import { pad2 } from '../../ui/StatusStamp';
import './bom.css';
import { useT } from '../../i18n';
import { bomCell, bomHeader } from './bomText';

const IN_ROOM = BOM_COLUMNS.filter((c) => c.key !== 'project' && c.key !== 'site' && c.key !== 'room');
// Name leads on screen and stays put while the rest scrolls sideways; the CSV keeps the domain's order.
const VISIBLE = [...IN_ROOM.filter((c) => c.key === 'name'), ...IN_ROOM.filter((c) => c.key !== 'name')];
const NOWRAP = new Set<string>(['rack', 'chassis', 'slot', 'name', 'position', 'heightU', 'depthMm', 'demandW']);

export function BomView({ location }: { location: RoomLocation }) {
  const m = useT();
  const all = useMemo(() => bomRows(location), [location]);
  const [filter, setFilter] = useState<EquipmentState | 'all'>('all');
  // The CSV follows the filter, so "what's still to install" is one click away.
  // Columns empty for every row (no chassis, no notes yet) only add width.
  const shown = useMemo(() => VISIBLE.filter((c) => c.key === 'name' || all.some((r) => r[c.key] !== '')), [all]);
  const rows = filter === 'all' ? all : all.filter((r) => r.state === EQUIPMENT_STATE_LABEL[filter]);
  const revision = currentRevision(location.room.plan);

  const cables = useMemo(() => cableSchedule(revision.content), [revision]);
  const downloadCables = (): void =>
    downloadText(`${slugify(location.room.name)}-R${pad2(revision.number)}-cables.csv`, `\uFEFF${cableCsv(cables)}`, 'text/csv;charset=utf-8');
  const download = (): void =>
    // The UTF-8 byte-order mark makes Excel read en dashes and Thai text correctly.
    downloadText(`${slugify(location.room.name)}-R${pad2(revision.number)}-bom.csv`, `\uFEFF${bomCsv(rows)}`, 'text/csv;charset=utf-8');

  return (
    <section className="bom glass" aria-labelledby="bom-h">
      <header className="bom__head">
        <h2 id="bom-h">{m.bom.title}</h2>
        <span className="bom__count">{m.bom.count(rows.length)}</span>
        {cables.length > 0 ? (
          <button type="button" className="btn" onClick={downloadCables}>
            {m.bom.cablesCsv(cables.length)}
          </button>
        ) : null}
        <button type="button" className="btn btn--ink" onClick={download} disabled={rows.length === 0}>
          {m.bom.download}
        </button>
      </header>
      {all.length > 0 ? (
        <div className="seg seg--compact bom__filter" role="group" aria-label={m.bom.filter}>
          {(['all', ...EQUIPMENT_STATES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'all' ? m.bom.all : m.equipment.state[s]}
            </button>
          ))}
        </div>
      ) : null}
      {rows.length === 0 && all.length > 0 ? <p className="bom__empty">{m.bom.noneInState}</p> : null}
      {all.length === 0 ? (
        <p className="bom__empty">{m.bom.empty}</p>
      ) : (
        <div className="bom__scroll">
          <table className="bom__table">
            <thead>
              <tr>
                {shown.map((c) => (
                  <th key={c.key} scope="col" className={c.key === 'name' ? 'bom__sticky' : undefined}>
                    {bomHeader(m, c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.rack}-${r.name}-${i}`} className={`bom__row bom__row--${r.kind.toLowerCase()}`}>
                  {shown.map((c) => (
                    <td key={c.key} className={[NOWRAP.has(c.key) ? 'mono bom__nowrap' : '', c.key === 'name' ? 'bom__sticky' : ''].filter(Boolean).join(' ') || undefined}>
                      {bomCell(m, r, c.key)}
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
