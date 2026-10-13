import { BOM_COLUMNS, bomCsv, bomRows, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { pad2 } from '../../ui/StatusStamp';
import './bom.css';

const VISIBLE = BOM_COLUMNS.filter((c) => c.key !== 'project' && c.key !== 'site' && c.key !== 'room');

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';

export function BomView({ location }: { location: RoomLocation }) {
  const rows = useMemo(() => bomRows(location), [location]);
  const revision = currentRevision(location.room.plan);

  const download = (): void => {
    const blob = new Blob([bomCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(location.room.name)}-R${pad2(revision.number)}-bom.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bom glass" aria-labelledby="bom-h">
      <header className="bom__head">
        <h2 id="bom-h">Devices &amp; BOM</h2>
        <span className="bom__count">{`${rows.length} ${rows.length === 1 ? 'Device' : 'Devices'}, each Node listed separately`}</span>
        <button type="button" className="btn btn--ink" onClick={download} disabled={rows.length === 0}>
          Download CSV
        </button>
      </header>
      {rows.length === 0 ? (
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
                    <td key={c.key} className={c.key === 'name' || c.key === 'position' || c.key === 'demandW' ? 'mono' : undefined}>
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
