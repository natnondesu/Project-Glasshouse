import { shortFingerprint, type Revision, type RoomLocation } from '@glasshouse/domain';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { usePeople } from '../../people/peopleStore';
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
  const people = usePeople();
  const unverified = (n: { name: string; userId?: string } | null): string => (n ? personLabel(m, n, people) : m.sheet.notRecorded);
  return (
    <header className="sheet-title">
      <div className="sheet-title__top">
        {/* The small cut (it is under 24 px), in mono ink so it prints the same in black and white. */}
        <img className="sheet-title__mark" src="/brand/glasshouse-mark-small-mono-ink.svg" width="24" height="24" alt="" />
        <h2 className="sheet-title__main">
          <span className="sheet-title__kicker">{m.sheet.kicker(section)}</span>
          <span className="visually-hidden">: </span>
          <strong>{`${location.project.name} / ${location.site.name} / ${location.room.name}`}</strong>
        </h2>
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
        {revision.approvedHash ? (
          <div>
            <dt>{m.sheet.fingerprint}</dt>
            <dd className="mono">{shortFingerprint(revision.approvedHash)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{m.sheet.printed}</dt>
          <dd className="sheet-title__printed">{formatTime(printedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}
