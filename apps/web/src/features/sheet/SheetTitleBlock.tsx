import type { Revision, RoomLocation } from '@glasshouse/domain';
import { pad2, STATE_LABEL } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';

interface SheetTitleBlockProps {
  location: RoomLocation;
  revision: Revision;
  printedAt: string;
  section: string;
}

const unverified = (n: { name: string } | null): string => (n ? `${n.name} (unverified)` : 'not recorded');

export function SheetTitleBlock({ location, revision, printedAt, section }: SheetTitleBlockProps) {
  return (
    <header className="sheet-title">
      <div className="sheet-title__main">
        <span className="sheet-title__kicker">Install sheet · {section}</span>
        <strong>{`${location.project.name} / ${location.site.name} / ${location.room.name}`}</strong>
      </div>
      <dl className="sheet-title__cells">
        <div>
          <dt>Revision</dt>
          <dd className="mono">{`R${pad2(revision.number)} ${STATE_LABEL[revision.state]}`}</dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{`Designed by ${unverified(revision.designedBy)} · Approved by ${unverified(revision.approvedBy)}`}</dd>
        </div>
        <div>
          <dt>Approved</dt>
          <dd>{formatTime(revision.approvedAt)}</dd>
        </div>
        <div>
          <dt>Printed</dt>
          <dd className="sheet-title__printed">{formatTime(printedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}
