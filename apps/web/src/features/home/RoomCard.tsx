import { formatWatts, revisionIssues } from '@glasshouse/domain';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight, IconBlock, IconCheck } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import type { RoomSummary } from './rooms';
import { RoomThumbnail } from './RoomThumbnail';

export function RoomFacts({ summary }: { summary: RoomSummary }) {
  const m = useT();
  const { revision } = summary;
  const content = revision.content;
  const parts = [m.home.racks(summary.racks), m.home.devices(summary.devices)];
  if (summary.knownW > 0) parts.push(`${formatWatts(summary.knownW)} / ${formatWatts(summary.limitW)}`);
  else parts.push(`${content.survey.width.toFixed(2)} × ${content.survey.length.toFixed(2)} m`);
  return <p className="mono home-card__facts">{parts.join(' · ')}</p>;
}

/** Approved: ready. Otherwise what still holds approval, in the Review badge's terms. */
export function RoomStatus({ summary }: { summary: RoomSummary }) {
  const m = useT();
  const { blocks, needsAck, openNotes } = summary.holds;
  const total = blocks + needsAck + openNotes;
  if (summary.revision.state === 'approved') {
    return (
      <p className="home-card__status home-card__status--ok">
        <IconCheck />
        {m.home.ready}
      </p>
    );
  }
  if (total === 0) return <p className="home-card__status">{m.home.nothingHolds}</p>;
  const detail = [blocks ? m.home.blocks(blocks) : '', needsAck ? m.checks.needsAck(needsAck) : '', openNotes ? m.checks.openNotes(openNotes) : ''].filter(Boolean);
  return (
    <p className="home-card__status">
      <span className="home-card__holds">
        <IconBlock />
        {m.home.beforeApproval(total)}
      </span>
      <span className="home-card__detail">{detail.join(' · ')}</span>
    </p>
  );
}

export function RoomCard({ summary }: { summary: RoomSummary }) {
  const m = useT();
  const { room, revision } = summary;
  return (
    <Link to={`/rooms/${room.id}/plan`} className="home-card glass">
      <span className="home-card__paper">
        <RoomThumbnail content={revision.content} issues={revisionIssues(revision)} roomName={room.name} />
      </span>
      <span className="home-card__body">
        <span className="home-card__head">
          <h3 className="home-card__name">{room.name}</h3>
          <span className={`stamp stamp--${revision.state}`}>{`R${pad2(revision.number)} ${m.revision.stamp[revision.state]}`}</span>
          <IconArrowRight className="home-card__go" />
        </span>
        <RoomFacts summary={summary} />
        <RoomStatus summary={summary} />
      </span>
    </Link>
  );
}
