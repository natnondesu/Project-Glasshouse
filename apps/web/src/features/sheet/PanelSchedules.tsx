import { isInUse, panelLayout, panelOf, wayPhase, wayPosition, type PlanContent, type RoomObject } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { TitleHead } from './SheetTables';

/** A one-row panel wraps after this many breakers so a 48-way row still fits the page width. */
const ROW_BAND = 12;

const hasSchedule = (content: PlanContent, o: RoomObject): boolean => o.type === 'mcb' && isInUse(o) && content.feeds.some((f) => f.sourceId === o.id);

/** What the sheet says about MCB panels: a schedule for each one in use with feeds, a line for each one not in use. */
export const sheetPanels = (content: PlanContent): RoomObject[] => content.objects.filter((o) => o.type === 'mcb' && (!isInUse(o) || hasSchedule(content, o)));

/** Each panel drawn in its arrangement (the same `wayPosition` as the plan and the 3D view), in ink only so it prints in black and white. */
export function PanelSchedules({ content, titleBlock }: { content: PlanContent; titleBlock: ReactNode }) {
  const m = useT();
  return (
    <table className="sheet-table sheet-panels" aria-label={m.sheet.panels.title}>
      <TitleHead span={1} titleBlock={titleBlock}>
        <tr>
          <th scope="col" className="visually-hidden">
            {m.sheet.panels.title}
          </th>
        </tr>
      </TitleHead>
      <tbody>
        {sheetPanels(content).map((o) => (
          <tr key={o.id}>
            <td>{isInUse(o) ? <Schedule panel={o} content={content} /> : <NotInUse panel={o} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NotInUse({ panel }: { panel: RoomObject }) {
  const m = useT();
  return (
    <p className="sheet-panel sheet-panel--off">
      <strong className="mono">{panel.name}</strong>
      {` · ${m.sheet.panels.notInUse}. ${m.sheet.panels.notInUseNote}`}
    </p>
  );
}

function Schedule({ panel, content }: { panel: RoomObject; content: PlanContent }) {
  const m = useT();
  const config = panelOf(panel);
  const layout = panelLayout(config);
  const feeds = content.feeds.filter((f) => f.sourceId === panel.id);
  const rackName = (id: string): string => content.objects.find((o) => o.id === id)?.name ?? m.feeds.removedObject;
  const columns = layout === 'row' ? Math.min(config.ways.length, ROW_BAND) : layout === 'column' ? 1 : 2;
  return (
    <div className="sheet-panel" role="group" aria-label={m.sheet.panels.of(panel.name)}>
      <p className="sheet-panel__head">
        <strong className="mono">{panel.name}</strong>
        {` · ${m.sheet.panels.head(config.phase === 'three' ? m.panelMgr.three : m.panelMgr.single, config.ways.length)}`}
      </p>
      {config.mainRatingA !== undefined ? <p className="sheet-panel__main mono">{m.sheet.panels.main(config.mainRatingA)}</p> : null}
      <ul role="list" className={`sheet-panel__grid sheet-panel__grid--${layout}`} style={layout === 'row' ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
        {config.ways.map((way, i) => {
          const n = i + 1;
          const pos = wayPosition(config, n);
          const feed = feeds.find((f) => f.way === n);
          // A long single row wraps into bands; every other arrangement is drawn as stored.
          const column = layout === 'row' ? pos.column % ROW_BAND : pos.column;
          const row = layout === 'row' ? Math.floor(pos.column / ROW_BAND) : pos.row;
          return (
            <li key={n} className={feed ? undefined : 'is-spare'} style={{ gridColumnStart: column + 1, gridRowStart: row + 1 }}>
              <strong className="mono">{n}</strong>
              <span className="mono sheet-panel__spec">
                <span>{`${way.ratingA} A`}</span>
                <span className="sheet-panel__dot">{' · '}</span>
                <span>{wayPhase(config, n)}</span>
              </span>
              <span className="sheet-panel__feed">{feed ? `${rackName(feed.targetId)} · ${feed.label}` : m.sheet.panels.spare}</span>
              {way.label ? <span className="sheet-panel__label">{way.label}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
