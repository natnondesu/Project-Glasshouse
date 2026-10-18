import { formatWatts, latestApproved } from '@glasshouse/domain';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight, IconMapPin, IconPlus } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { holdsTotal } from '../home/RoomCard';
import type { RoomSummary } from '../home/rooms';
import { SceneBoundary } from '../home/SceneBoundary';
import { formatLatLon } from './format';
import type { SiteSummary } from './sites';

// three.js is large: the card draws its text at once and brings the 3D in after.
const HeroScene = lazy(() => import('../home/HeroScene'));

interface SiteCardProps {
  summary: SiteSummary;
  roomId: string | null;
  lastRoomId: string | null;
  onRoom: (roomId: string) => void;
  canEdit: boolean;
  onLocate: () => void;
  onPlace: () => void;
  onNewRoom: () => void;
}

function RoomHolds({ room }: { room: RoomSummary }) {
  const m = useT();
  const id = room.room.id;
  if (room.revision.state === 'approved') {
    return (
      <span className="site-room__ok">
        <IconCheck />
        {m.globe.ready}
      </span>
    );
  }
  if (holdsTotal(room) === 0) return <span className="site-room__quiet">{m.home.nothingHolds}</span>;
  const links = [
    room.holds.blocks ? <Link key="b" to={`/rooms/${id}/review`} className="site-room__block">{m.home.blocks(room.holds.blocks)}</Link> : null,
    room.holds.needsAck ? <Link key="a" to={`/rooms/${id}/review`}>{m.checks.needsAck(room.holds.needsAck)}</Link> : null,
  ].filter((l) => l !== null);
  return (
    <span className="site-room__holds">
      {links.map((l, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          {l}
        </span>
      ))}
    </span>
  );
}

/**
 * The selected site: what it holds, each room with its revision and what holds its approval (links to Review), the
 * chosen room live in 3D, and the way into it. Rooms change by a click or prev/next, never on a timer.
 */
export function SiteCard({ summary, roomId, lastRoomId, onRoom, canEdit, onLocate, onPlace, onNewRoom }: SiteCardProps) {
  const m = useT();
  const { site, project, rooms } = summary;
  const index = Math.max(0, rooms.findIndex((r) => r.room.id === roomId));
  const room = rooms[index] ?? null;
  const holds = room && room.revision.state !== 'approved' ? holdsTotal(room) : 0;
  const approved = room ? latestApproved(room.room.plan) : undefined;
  const step = (by: number): void => {
    const next = rooms[(index + by + rooms.length) % rooms.length];
    if (next) onRoom(next.room.id);
  };

  return (
    <div className="site-card">
      <header className="site-card__head">
        <h1 id="home-site-name">{site.name}</h1>
        <p className="site-card__project">{project.name}</p>
        <p className="site-card__where">
          <IconMapPin />
          {summary.location ? <span className="mono">{formatLatLon(summary.location)}</span> : <span>{m.globe.notOnMap}</span>}
          {canEdit ? (
            summary.location ? (
              <button type="button" className="site-card__link" aria-label={m.globe.editLocation(site.name)} onClick={onLocate}>
                {m.globe.edit}
              </button>
            ) : (
              <button type="button" className="site-card__link" onClick={onPlace}>
                {m.globe.placeOnMap}
              </button>
            )
          ) : null}
        </p>
      </header>
      {rooms.length > 0 ? (
        <dl className="site-card__facts">
          <div>
            <dt>{m.globe.roomsLabel}</dt>
            <dd className="mono">{rooms.length}</dd>
          </div>
          <div>
            <dt>{m.globe.racksLabel}</dt>
            <dd className="mono">{summary.racks}</dd>
          </div>
          <div>
            <dt>{m.globe.powerLabel}</dt>
            <dd className="mono">
              {formatWatts(summary.knownW)}
              <small>
                {m.power.ofShort(formatWatts(summary.limitW))}
                {summary.unknownDemand > 0 ? ` · ${m.globe.unknownDemand(summary.unknownDemand)}` : ''}
              </small>
            </dd>
          </div>
        </dl>
      ) : null}
      {room ? (
        <>
          <div className="site-card__paper">
            <SceneBoundary key={room.room.id} message={m.home.scene3dFailed} reload={m.home.reload}>
              <Suspense fallback={<p className="home-hero__fallback">{m.home.loading3d}</p>}>
                <HeroScene location={{ project, site, room: room.room }} caption={room.room.name} />
              </Suspense>
            </SceneBoundary>
            {rooms.length > 1 ? (
              <div className="site-card__stepper">
                <button type="button" className="icon-btn" aria-label={m.globe.prevRoom} onClick={() => step(-1)}>
                  <IconChevronLeft />
                </button>
                <span className="mono" aria-live="polite">
                  {m.globe.roomCount(index + 1, rooms.length)}
                </span>
                <button type="button" className="icon-btn" aria-label={m.globe.nextRoom} onClick={() => step(1)}>
                  <IconChevronRight />
                </button>
              </div>
            ) : null}
          </div>
          <ul className="site-card__rooms" aria-label={m.globe.roomsOf(site.name)}>
            {rooms.map((r) => {
              const isOn = r.room.id === room.room.id;
              return (
                <li key={r.room.id} className={`site-room${isOn ? ' is-on' : ''}`}>
                  <button type="button" className="site-room__pick" aria-pressed={isOn} aria-label={m.globe.showRoom(r.room.name)} onClick={() => onRoom(r.room.id)}>
                    <span className="site-room__name">{r.room.name}</span>
                    {r.room.id === lastRoomId ? <span className="home-card__last">{m.home.lastOpened}</span> : null}
                    <span className={`stamp stamp--${r.revision.state}`}>{`R${pad2(r.revision.number)} ${m.revision.stamp[r.revision.state]}`}</span>
                  </button>
                  <p className="site-room__line">
                    <span className="mono">
                      {m.home.racks(r.racks)} · {formatWatts(r.knownW)}
                    </span>
                    <RoomHolds room={r} />
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="site-card__actions">
            {holds > 0 ? (
              <>
                <Link to={`/rooms/${room.room.id}/review`} className="btn btn--ink">
                  {m.home.resolve(holds)}
                  <IconArrowRight />
                </Link>
                <Link to={`/rooms/${room.room.id}/plan`} className="btn site-card__open" title={m.globe.openRoom(room.room.name)}>
                  {m.globe.openRoom(room.room.name)}
                </Link>
              </>
            ) : (
              <Link to={`/rooms/${room.room.id}/plan`} className="btn btn--ink site-card__open" title={m.globe.openRoom(room.room.name)}>
                {m.globe.openRoom(room.room.name)}
                <IconArrowRight />
              </Link>
            )}
            {approved ? (
              <Link to={`/rooms/${room.room.id}/install-sheet`} className="btn">
                {m.views.installSheet(pad2(approved.number))}
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <div className="site-card__empty">
          <p>{m.globe.noRooms}</p>
          {canEdit ? (
            <button type="button" className="btn btn--ink" onClick={onNewRoom}>
              <IconPlus />
              {m.home.newRoomIn(site.name)}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
