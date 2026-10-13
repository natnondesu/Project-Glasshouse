import { bomRowsFor, currentRevision, latestApproved, racksOf, type Chassis, type Rack } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFound } from '../../app/NotFound';
import { useRoomLocation } from '../../store/hooks';
import { pad2 } from '../../ui/StatusStamp';
import { RackElevation } from '../elevation/RackElevation';
import { SheetPlan } from './SheetPlan';
import { BomTable, SlotMapsTable } from './SheetTables';
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

      {elevationPages(racks).map((group, i) => (
        <section key={`elev-${i}`} className="sheet-page">
          {title('Rack elevations')}
          <div className="sheet-elevations">
            {group.map((rack) => (
              <RackElevation key={rack.id} rack={rack} active={false} selectedId={null} flagged={NO_FLAGS} onSelect={noop} onActivate={noop} onDropTemplate={noop} isStatic />
            ))}
          </div>
        </section>
      ))}

      {chassis.length > 0 ? (
        <section className="sheet-page sheet-page--flow">
          <SlotMapsTable chassis={chassis} titleBlock={title('Slot maps')} />
        </section>
      ) : null}

      <section className="sheet-page sheet-page--flow">
        <BomTable rows={bomRowsFor(location, revision)} revision={revision} titleBlock={title('Bill of materials')} />
      </section>
    </main>
  );
}
