import type { Revision, RoomLocation } from '@glasshouse/domain';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { formatTime } from '../../ui/time';

interface SheetTitleBlockProps {
  location: RoomLocation;
  revision: Revision;
  printedAt: string;
  section: string;
}

export function SheetTitleBlock({ location, revision, printedAt, section }: SheetTitleBlockProps) {
  const m = useT();
  const unverified = (n: { name: string } | null): string => (n ? m.sheet.unverified(n.name) : m.sheet.notRecorded);
  return (
    <header className="sheet-title">
      <div className="sheet-title__main">
        <span className="sheet-title__kicker">{m.sheet.kicker(section)}</span>
        <strong>{`${location.project.name} / ${location.site.name} / ${location.room.name}`}</strong>
      </div>
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
