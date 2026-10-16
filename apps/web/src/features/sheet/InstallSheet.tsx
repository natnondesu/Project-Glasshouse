import { useDocumentTitle } from '../../ui/useDocumentTitle';
import { bomRowsFor, cableSchedule, equipmentStateOf, currentRevision, latestApproved, orderedRacks, stackOf, type Chassis, type PlanContent, type Rack } from '@glasshouse/domain';
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
import { buildTopology, fitTopology, type Remotes, type Topology } from '../network/topology';

/**
 * Room for the diagram on A4 inside 12 mm margins, under the title block, in px. Divided by the
 * 85% floor: the diagram's 13px labels may shrink that far (to 11px) and no further.
 */
const DIAGRAM_FLOOR = 0.85;
const PORTRAIT = { w: 700 / DIAGRAM_FLOOR, h: 820 / DIAGRAM_FLOOR };
const LANDSCAPE = { w: 1030 / DIAGRAM_FLOOR, h: 560 / DIAGRAM_FLOOR };

/**
 * The full diagram on portrait, else on landscape; a room too big for either prints its network
 * gear with device counts (the cable schedule lists every cable).
 */
function sheetTopology(content: PlanContent, remotes: Remotes): { topology: Topology; landscape: boolean } {
  const portrait = fitTopology(content, PORTRAIT.w, PORTRAIT.h, remotes);
  if (portrait) return { topology: portrait, landscape: false };
  const wide = fitTopology(content, LANDSCAPE.w, LANDSCAPE.h, remotes);
  const topology = wide ?? buildTopology(content, { collapseLeaves: true, remotes });
  return { topology, landscape: topology.width > PORTRAIT.w };
}
import '../network/network.css';
import { SheetTitleBlock } from './SheetTitleBlock';
import { farEndOf, remoteNamer } from '../network/uplinks';
import { useWorkspaceStore } from '../../store/workspaceStore';
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
  const workspace = useWorkspaceStore((s) => s.workspace);
  const sheetRev = location ? latestApproved(location.room.plan) : null;
  useDocumentTitle(location ? `${location.room.name} · ${sheetRev ? m.views.installSheet(String(sheetRev.number).padStart(2, '0')) : m.views.installAfter}` : null);
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

  // The order the team set in Elevation (plan order by default), so paper reads like the screen.
  const racks: Rack[] = orderedRacks(revision.content, location.room.plan.rackOrder);
  const chassis = racks.flatMap((rack) => rack.devices.filter((d): d is Chassis => d.kind === 'chassis').map((c) => ({ rack, chassis: c })));
  const title = (section: string) => <SheetTitleBlock location={location} revision={revision} printedAt={printedAt} section={section} />;
  const { topology, landscape } = sheetTopology(revision.content, remoteNamer(workspace, m));

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
              <RackElevation key={rack.id} rack={rack} active={false} selectedId={null} flagged={NO_FLAGS} onSelect={noop} onActivate={noop} onDropTemplate={noop} isStatic stateOf={(id) => equipmentStateOf(location.room.plan, id)} stackOf={(id) => {
                const hit = stackOf(revision.content, id);
                return hit ? { name: hit.stack.name, member: hit.member } : null;
              }} />
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
        <section className={`sheet-page${landscape ? ' sheet-page--landscape' : ''}`}>
          {title(m.sheet.network)}
          {revision.content.links.length > 0 ? (
            <div className="sheet-topo">
              <TopologyDiagram content={revision.content} topology={topology} stateOf={(id) => equipmentStateOf(location.room.plan, id)} isStatic />
              {topology.collapsed ? <p className="sheet-topo__note">{m.sheet.topoCollapsed}</p> : null}
            </div>
          ) : null}
          {revision.content.vlans.length > 0 ? <VlanTable content={revision.content} /> : null}
        </section>
      ) : null}

      {revision.content.links.length > 0 ? (
        <section className="sheet-page sheet-page--flow">
          <CableScheduleTable rows={cableSchedule(revision.content, farEndOf(workspace, m))} titleBlock={title(m.sheet.cableSchedule)} />
        </section>
      ) : null}

      <section className="sheet-page sheet-page--flow sheet-page--landscape">
        <BomTable rows={bomRowsFor(location, revision)} revision={revision} titleBlock={title(m.sheet.bom)} />
      </section>
    </main>
  );
}
