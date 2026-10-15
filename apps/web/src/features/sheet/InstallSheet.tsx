import { bomRowsFor, cableSchedule, equipmentStateOf, currentRevision, latestApproved, racksOf, type Chassis, type Rack } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NotFound } from '../../app/NotFound';
import { useRoomLocation, useViewedRevisionNumber } from '../../store/hooks';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { RackElevation } from '../elevation/RackElevation';
import { SheetPlan } from './SheetPlan';
import { BomTable, CableScheduleTable, SlotMapsTable, VlanTable } from './SheetTables';
import { TopologyDiagram } from '../network/TopologyDiagram';
import { fitTopology } from '../network/topology';

/** A4 portrait inside 12 mm margins is ~186 mm ≈ 700 px; wrap leaves so the diagram prints near full size. */
const SHEET_DIAGRAM_W = 700;
import '../network/network.css';
import { SheetTitleBlock } from './SheetTitleBlock';
import './sheet.css';

/** Two racks fit side by side on A4 up to this height; taller ones get a page each (and scale to fit). */
const PAIRED_MAX_U = 44;
const NO_FLAGS = new Set<string>();
const noop = (): void => undefined;

function elevationPages(racks: Rack[]): Rack[][] {
  const pages: Rack[][] = [];
  let pair: Rack[] = [];
  for (const rack of racks) {
    if (rack.capacityU > PAIRED_MAX_U) {
      pages.push([rack]);
      continue;
    }
    pair.push(rack);
    if (pair.length === 2) {
      pages.push(pair);
      pair = [];
    }
  }
  if (pair.length > 0) pages.push(pair);
  return pages;
}

/** The "Printed" stamp is taken when the browser prints, not when the page was opened. */
function usePrintTime(): string {
  const [at, setAt] = useState(() => new Date().toISOString());
  useEffect(() => {
    const stamp = (): void => setAt(new Date().toISOString());
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);
  return at;
}

export function InstallSheet() {
  const { roomId = '' } = useParams();
  const location = useRoomLocation(roomId);
  const printedAt = usePrintTime();
  const viewedNumber = useViewedRevisionNumber();
  const navigate = useNavigate();
  const m = useT();
  if (!location) return <NotFound message={m.shell.roomMissing} />;
  const approved = location.room.plan.revisions.filter((r) => r.state === 'approved');
  const revision = approved.find((r) => r.number === viewedNumber) ?? latestApproved(location.room.plan);
  const current = currentRevision(location.room.plan);

  if (!revision) {
    return (
      <main className="sheet sheet--empty">
        <h1>{m.sheet.noApprovedTitle}</h1>
        <p>{m.sheet.noApproved(location.room.name, pad2(current.number))}</p>
        <Link to={`/rooms/${roomId}/review`} className="btn btn--ink">
          {m.revision.openReview}
        </Link>
      </main>
    );
  }

  const racks: Rack[] = [...racksOf(revision.content)].sort((a, b) => a.name.localeCompare(b.name));
  const chassis = racks.flatMap((rack) => rack.devices.filter((d): d is Chassis => d.kind === 'chassis').map((c) => ({ rack, chassis: c })));
  const title = (section: string) => <SheetTitleBlock location={location} revision={revision} printedAt={printedAt} section={section} />;

  return (
    <main className="sheet">
      <h1 className="visually-hidden">{m.sheet.pageTitle(location.room.name, pad2(revision.number))}</h1>
      <nav className="sheet-toolbar" aria-label={m.sheet.nav}>
        <Link to={`/rooms/${roomId}/review`} className="btn btn--sm btn--quiet">
          {m.sheet.backToRoom}
        </Link>
        {approved.length > 1 ? (
          <label className="sheet-toolbar__picker">
            <span>{m.sheet.approvedRevision}</span>
            <select value={revision.number} onChange={(e) => void navigate(`/rooms/${roomId}/install-sheet?rev=${e.target.value}`)}>
              {[...approved].reverse().map((r) => (
                <option key={r.number} value={r.number}>{`R${pad2(r.number)}`}</option>
              ))}
            </select>
          </label>
        ) : null}
        {current.number !== revision.number ? <span className="sheet-toolbar__note">{m.sheet.newer(pad2(current.number), m.revision.state[current.state].toLowerCase(), pad2(revision.number))}</span> : null}
        <button type="button" className="btn btn--sm btn--ink" onClick={() => window.print()}>
          {m.sheet.print}
        </button>
      </nav>

      <section className="sheet-page">
        {title(m.sheet.roomPlan)}
        <SheetPlan content={revision.content} roomName={location.room.name} />
        <p className="sheet-legend">{m.sheet.planLegend}</p>
      </section>

      {elevationPages(racks).map((group, i) => (
        <section key={`elev-${i}`} className="sheet-page">
          {title(m.sheet.rackElevations)}
          <div className="sheet-elevations">
            {group.map((rack) => (
              <RackElevation key={rack.id} rack={rack} active={false} selectedId={null} flagged={NO_FLAGS} onSelect={noop} onActivate={noop} onDropTemplate={noop} isStatic stateOf={(id) => equipmentStateOf(location.room.plan, id)} />
            ))}
          </div>
        </section>
      ))}

      {chassis.length > 0 ? (
        <section className="sheet-page sheet-page--flow">
          <SlotMapsTable chassis={chassis} titleBlock={title(m.sheet.slotMaps)} />
        </section>
      ) : null}

      {revision.content.links.length > 0 || revision.content.vlans.length > 0 ? (
        <section className="sheet-page">
          {title(m.sheet.network)}
          {revision.content.links.length > 0 ? (
            <div className="sheet-topo">
              <TopologyDiagram content={revision.content} topology={fitTopology(revision.content, SHEET_DIAGRAM_W)} stateOf={(id) => equipmentStateOf(location.room.plan, id)} isStatic />
            </div>
          ) : null}
          {revision.content.vlans.length > 0 ? <VlanTable content={revision.content} /> : null}
        </section>
      ) : null}

      {revision.content.links.length > 0 ? (
        <section className="sheet-page sheet-page--flow">
          <CableScheduleTable rows={cableSchedule(revision.content)} titleBlock={title(m.sheet.cableSchedule)} />
        </section>
      ) : null}

      <section className="sheet-page sheet-page--flow">
        <BomTable rows={bomRowsFor(location, revision)} revision={revision} titleBlock={title(m.sheet.bom)} />
      </section>
    </main>
  );
}
