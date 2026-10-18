import { formatWatts, latestApproved } from '@glasshouse/domain';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconMapPin, IconPlus, IconSheet } from '../../ui/icons';
import { usePeople } from '../../people/peopleStore';
import { personLabel } from '../../ui/person';
import { pad2 } from '../../ui/StatusStamp';
import { holdsTotal, type RoomSummary } from '../home/rooms';
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
  /** Closes the card: the scope steps back up to the site's province (or country). */
  onClose: () => void;
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
 * The selected site, floating over the map's top right: what it holds, each room with its revision and what holds its approval (links to Review), the
 * chosen room live in 3D, and the way into it. Rooms change by a click or prev/next, never on a timer.
 */
export function SiteCard({ summary, roomId, lastRoomId, onRoom, canEdit, onLocate, onPlace, onNewRoom, onClose }: SiteCardProps) {
  const m = useT();
  const { site, project, rooms } = summary;
  const index = Math.max(0, rooms.findIndex((r) => r.room.id === roomId));
  const room = rooms[index] ?? null;
  const holds = room && room.revision.state !== 'approved' ? holdsTotal(room) : 0;
  const approved = room ? latestApproved(room.room.plan) : undefined;
  const people = usePeople();
  // The picked room's record, as the Review stamp reads: state, then revision · date · who (unverified when typed).
  const revision = room?.revision;
  const person = revision ? (revision.state === 'approved' ? revision.approvedBy : revision.designedBy) : null;
  const by = person ? personLabel(m, person, people) : undefined;
  const when = revision ? (revision.state === 'approved' ? revision.approvedAt : revision.submittedAt)?.slice(0, 10) : undefined;
  const step = (by: number): void => {
    const next = rooms[(index + by + rooms.length) % rooms.length];
    if (next) onRoom(next.room.id);
  };

  return (
    <section className="site-card globe-sitecard" aria-labelledby="home-site-name">
      <button type="button" className="icon-btn site-card__close" aria-label={m.home.closeCard(site.name)} onClick={onClose}>
        <IconClose />
      </button>
      <header className="site-card__head">
        <h2 id="home-site-name" tabIndex={-1}>
          {site.name}
        </h2>
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
            {revision ? (
              <p className={`home-hero__stamp home-hero__stamp--${revision.state} site-card__stamp`}>
                <span className="mono">{m.revision.stamp[revision.state]}</span>
                <span className="mono">{[`R${pad2(revision.number)}`, when, by].filter(Boolean).join(' · ')}</span>
              </p>
            ) : null}
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
                  <span>{m.globe.openRoom(room.room.name)}</span>
                </Link>
              </>
            ) : (
              <Link to={`/rooms/${room.room.id}/plan`} className="btn btn--ink site-card__open" title={m.globe.openRoom(room.room.name)}>
                <span>{m.globe.openRoom(room.room.name)}</span>
                <IconArrowRight />
              </Link>
            )}
            {approved ? (
              // Quieter than the way into the room, and one icon wide, so the actions never wrap; its name is its hint.
              <Link to={`/rooms/${room.room.id}/install-sheet`} className="btn site-card__sheet" aria-label={m.views.installSheet(pad2(approved.number))}>
                <IconSheet />
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
    </section>
  );
}
