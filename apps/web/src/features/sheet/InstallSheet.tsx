import { bomRowsFor, currentRevision, latestApproved, racksOf, type Chassis, type Rack } from '@glasshouse/domain';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { NotFound } from '../../app/NotFound';
import { useRoomLocation } from '../../store/hooks';
import { pad2 } from '../../ui/StatusStamp';
import { RackElevation } from '../elevation/RackElevation';
import { SheetPlan } from './SheetPlan';
import { AcknowledgedUnknowns, BomTable, SlotMapTable } from './SheetTables';
import { SheetTitleBlock } from './SheetTitleBlock';
import './sheet.css';

const RACKS_PER_PAGE = 2;
const SLOT_MAPS_PER_PAGE = 4;
const NO_FLAGS = new Set<string>();
const noop = (): void => undefined;

const chunk = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

export function InstallSheet() {
  const { roomId = '' } = useParams();
  const location = useRoomLocation(roomId);
  const printedAt = useMemo(() => new Date().toISOString(), []);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  const revision = latestApproved(location.room.plan);
  const current = currentRevision(location.room.plan);

  if (!revision) {
    return (
      <main className="sheet sheet--empty">
        <h1>No Approved revision yet</h1>
        <p>{`The Install sheet is printed from an Approved revision. ${location.room.name} is at R${pad2(current.number)} and hasn't been approved.`}</p>
        <Link to={`/rooms/${roomId}/review`} className="btn btn--ink">
          Open review
        </Link>
      </main>
    );
  }

  const racks: Rack[] = [...racksOf(revision.content)].sort((a, b) => a.name.localeCompare(b.name));
  const chassis = racks.flatMap((rack) => rack.devices.filter((d): d is Chassis => d.kind === 'chassis').map((c) => ({ rack, chassis: c })));
  const title = (section: string) => <SheetTitleBlock location={location} revision={revision} printedAt={printedAt} section={section} />;

  return (
    <main className="sheet">
      <nav className="sheet-toolbar" aria-label="Install sheet">
        <Link to={`/rooms/${roomId}/review`} className="btn btn--sm btn--quiet">
          Back to room
        </Link>
        {current.number !== revision.number ? <span className="sheet-toolbar__note">{`A newer Draft (R${pad2(current.number)}) exists. This sheet shows the Approved R${pad2(revision.number)}.`}</span> : null}
        <button type="button" className="btn btn--sm btn--ink" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </nav>

      <section className="sheet-page">
        {title('Room plan')}
        <SheetPlan content={revision.content} roomName={location.room.name} />
        <p className="sheet-legend">Distances in metres from each Rack to the nearest walls. Hatched bands are Clearance zones; the arrow marks each Rack's Front.</p>
      </section>

      {chunk(racks, RACKS_PER_PAGE).map((group, i) => (
        <section key={`elev-${i}`} className="sheet-page">
          {title('Rack elevations')}
          <div className="sheet-elevations">
            {group.map((rack) => (
              <RackElevation key={rack.id} rack={rack} active={false} selectedId={null} flagged={NO_FLAGS} onSelect={noop} onActivate={noop} onDropTemplate={noop} isStatic />
            ))}
          </div>
        </section>
      ))}

      {chunk(chassis, SLOT_MAPS_PER_PAGE).map((group, i) => (
        <section key={`slots-${i}`} className="sheet-page">
          {title('Slot maps')}
          <div className="sheet-slotmaps">
            {group.map(({ rack, chassis: c }) => (
              <SlotMapTable key={c.id} chassis={c} rackName={rack.name} />
            ))}
          </div>
        </section>
      ))}

      <section className="sheet-page sheet-page--flow">
        <BomTable rows={bomRowsFor(location, revision)} titleBlock={title('Bill of materials')} />
        <AcknowledgedUnknowns revision={revision} />
      </section>
    </main>
  );
}
