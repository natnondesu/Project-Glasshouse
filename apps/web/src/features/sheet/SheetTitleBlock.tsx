import type { Revision, RoomLocation } from '@glasshouse/domain';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { personLabel } from '../../ui/person';
import { formatTime } from '../../ui/time';

interface SheetTitleBlockProps {
  location: RoomLocation;
  revision: Revision;
  printedAt: string;
  section: string;
}

export function SheetTitleBlock({ location, revision, printedAt, section }: SheetTitleBlockProps) {
  const m = useT();
  const unverified = (n: { name: string; userId?: string } | null): string => (n ? personLabel(m, n) : m.sheet.notRecorded);
  return (
    <header className="sheet-title">
      <h2 className="sheet-title__main">
        <span className="sheet-title__kicker">{m.sheet.kicker(section)}</span>
        <span className="visually-hidden">: </span>
        <strong>{`${location.project.name} / ${location.site.name} / ${location.room.name}`}</strong>
      </h2>
      <dl className="sheet-title__cells">
        <div>
          <dt>{m.sheet.revision}</dt>
          <dd className="mono">{`R${pad2(revision.number)} ${m.revision.stamp[revision.state]}`}</dd>
        </div>
        <div>
          <dt>{m.sheet.people}</dt>
          <dd>{m.sheet.peopleLine(unverified(revision.designedBy), unverified(revision.approvedBy))}</dd>
        </div>
        <div>
          <dt>{m.sheet.approved}</dt>
          <dd>{formatTime(revision.approvedAt)}</dd>
        </div>
        <div>
          <dt>{m.sheet.printed}</dt>
          <dd className="sheet-title__printed">{formatTime(printedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}
