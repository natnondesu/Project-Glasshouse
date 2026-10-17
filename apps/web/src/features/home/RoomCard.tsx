import { formatWatts, revisionIssues } from '@glasshouse/domain';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight, IconBlock, IconCheck } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { writePreference } from '../../ui/usePersistentState';
import type { RoomSummary } from './rooms';
import { RoomThumbnail } from './RoomThumbnail';

function RoomFacts({ summary }: { summary: RoomSummary }) {
  const m = useT();
  const content = summary.revision.content;
  const parts = [m.home.racks(summary.racks), m.home.devices(summary.devices)];
  if (summary.knownW > 0) parts.push(`${formatWatts(summary.knownW)} / ${formatWatts(summary.limitW)}`);
  else parts.push(`${content.survey.width.toFixed(2)} × ${content.survey.length.toFixed(2)} m`);
  return <p className="mono home-card__facts">{parts.join(' · ')}</p>;
}

export const holdsTotal = (s: RoomSummary): number => s.holds.blocks + s.holds.needsAck;

/**
 * Approved: ready. Otherwise what still holds approval, each count a way straight to it: checks open
 * on the plan's Checks list (opened on arrival), open notes in Review.
 */
export function RoomStatus({ summary }: { summary: RoomSummary }) {
  const m = useT();
  const { blocks, needsAck } = summary.holds;
  const id = summary.room.id;
  const total = holdsTotal(summary);
  if (summary.revision.state === 'approved') {
    return (
      <p className="home-card__status home-card__status--ok">
        <IconCheck />
        {m.home.ready}
      </p>
    );
  }
  if (total === 0) return <p className="home-card__status">{m.home.nothingHolds}</p>;
  const openChecks = (): void => writePreference('glasshouse:checks-open', true);
  const links = [
    blocks ? <Link key="b" to={`/rooms/${id}/plan`} onClick={openChecks}>{m.home.blocks(blocks)}</Link> : null,
    needsAck ? <Link key="a" to={`/rooms/${id}/plan`} onClick={openChecks}>{m.checks.needsAck(needsAck)}</Link> : null,
  ].filter((l) => l !== null);
  return (
    <p className="home-card__status">
      <span className="home-card__holds">
        <IconBlock />
        {m.home.beforeApproval(total)}
      </span>
      <span className="home-card__detail">
        {links.map((l, i) => (
          <span key={i}>
            {i > 0 ? <span aria-hidden="true"> · </span> : null}
            {l}
          </span>
        ))}
      </span>
    </p>
  );
}

/** A room on paper. The name is the link and covers the card; the hold counts are links of their own above it. */
export function RoomCard({ summary, lastOpened = false }: { summary: RoomSummary; lastOpened?: boolean }) {
  const m = useT();
  const { room, revision } = summary;
  return (
    <article className="home-card glass">
      <div className="home-card__paper">
        <RoomThumbnail content={revision.content} issues={revisionIssues(revision)} roomName={room.name} />
      </div>
      <div className="home-card__body">
        <div className="home-card__head">
          <h3 className="home-card__name">
            <Link to={`/rooms/${room.id}/plan`} className="home-card__link">
              {room.name}
            </Link>
          </h3>
          <span className={`stamp stamp--${revision.state}`}>{`R${pad2(revision.number)} ${m.revision.stamp[revision.state]}`}</span>
          {lastOpened ? <span className="home-card__last">{m.home.lastOpened}</span> : null}
          <IconArrowRight className="home-card__go" />
        </div>
        <RoomFacts summary={summary} />
        <RoomStatus summary={summary} />
      </div>
    </article>
  );
}
