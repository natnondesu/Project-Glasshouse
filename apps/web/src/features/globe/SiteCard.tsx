import { formatWatts, latestApproved } from '@glasshouse/domain';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconArrowRight, IconBlock, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconMapPin, IconPlus, IconSheet, IconWarn } from '../../ui/icons';
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
  /** The height the card may take on the map; unknown (no layout) means the 3D shows at its usual size. */
  fitHeight?: number;
}

/** The card's own parts besides the 3D and the room rows: head, actions, gaps and padding. The numbers strip under the map carries the site's totals. */
const CARD_CHROME_PX = 196;
/** A room row as drawn: name and chip, then racks, power and holds. */
const ROOM_ROW_PX = 58;
/** Room rows kept in view under the 3D: two when the card has the room, else one; the rest of the list scrolls. */
const ROWS_KEPT = [2, 1];
/** Before the card is measured. */
const SCENE_DEFAULT_PX = 180;
/** The 3D takes the card's spare height up to this: a one-room site gets a big room. */
const SCENE_MAX_PX = 320;
/** Below this the 3D folds into a strip with a toggle: a sliver of a room helps nobody. */
const SCENE_MIN_PX = 110;
/** The folded 3D, opened again: the card scrolls to show it. */
const SCENE_OPENED_PX = 160;

/** How tall the 3D may be so the first room rows stay in view under it; null when it should fold. */
export function sceneHeight(fitHeight: number | undefined, rooms: number): number | null {
  if (fitHeight === undefined) return SCENE_DEFAULT_PX;
  for (const keep of ROWS_KEPT) {
    const room = fitHeight - CARD_CHROME_PX - Math.min(rooms, keep) * ROOM_ROW_PX;
    if (room >= SCENE_MIN_PX) return Math.min(SCENE_MAX_PX, room);
  }
  return null;
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
 * The selected site, floating over the map's top right: the chosen room live in 3D first, each room with its revision and what holds its approval
 * (links to Review), and the way into it. The site's totals are in the numbers strip under the map, not repeated here. Rooms change by a click or
 * prev/next, never on a timer.
 */
export function SiteCard({ summary, roomId, lastRoomId, onRoom, canEdit, onLocate, onPlace, onNewRoom, onClose, fitHeight }: SiteCardProps) {
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
  const fitted = sceneHeight(fitHeight, rooms.length);
  const [opened, setOpened] = useState(false);
  const folded = fitted === null && !opened;
  const scene = fitted ?? SCENE_OPENED_PX;
  // A fade at the foot while there is more to scroll to.
  const card = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = card.current;
    if (el) setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }, []);
  useEffect(() => {
    measure();
    const el = card.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, folded, roomId, fitHeight]);
  const stepper =
    rooms.length > 1 ? (
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
    ) : null;
  const step = (by: number): void => {
    const next = rooms[(index + by + rooms.length) % rooms.length];
    if (next) onRoom(next.room.id);
  };

  return (
    <section ref={card} className={`site-card globe-sitecard${more ? ' has-more' : ''}`} aria-labelledby="home-site-name" onScroll={measure}>
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
      {room ? (
        <>
          {fitted === null ? (
            // A very short map: the 3D folds into a strip so a room row stays in view; the rows pick the room.
            <div className="site-card__strip">
              <span className="site-card__strip-name">
                <span className="mono">3D</span> {room.room.name}
              </span>
              <button type="button" className="btn btn--sm site-card__fold" aria-expanded={!folded} aria-controls="site-card-scene" onClick={() => setOpened(!opened)}>
                {folded ? m.globe.show3d : m.globe.hide3d}
              </button>
            </div>
          ) : null}
          {folded ? null : (
            <div className="site-card__paper" id="site-card-scene" style={{ height: `${scene}px` }}>
              <SceneBoundary key={room.room.id} message={m.home.scene3dFailed} reload={m.home.reload}>
                <Suspense fallback={<p className="home-hero__fallback">{m.home.loading3d}</p>}>
                  <HeroScene location={{ project, site, room: room.room }} caption={room.room.name} compact />
                </Suspense>
              </SceneBoundary>
              {revision ? (
                <p className={`home-hero__stamp home-hero__stamp--${revision.state} site-card__stamp`}>
                  <span className="mono">{m.revision.stamp[revision.state]}</span>
                  <span className="mono">{[`R${pad2(revision.number)}`, when, by].filter(Boolean).join(' · ')}</span>
                </p>
              ) : null}
              {stepper}
            </div>
          )}
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
            {/* Opening the room is always the accent action; holds get a quieter Resolve beside it (the rows above link them too). */}
            <Link to={`/rooms/${room.room.id}/plan`} className="btn btn--ink site-card__open" title={m.globe.openRoom(room.room.name)}>
              <span>{m.globe.openRoom(room.room.name)}</span>
              <IconArrowRight />
            </Link>
            {holds > 0 ? (
              // Compact so the room's name keeps its width: the hold's icon (blocking, else to acknowledge) and the count; the full name is its label and hint.
              <Link
                to={`/rooms/${room.room.id}/review`}
                className={`btn site-card__resolve${room.holds.blocks ? ' is-block' : ''}`}
                aria-label={m.home.resolve(holds)}
                title={m.home.resolve(holds)}
              >
                {room.holds.blocks ? <IconBlock /> : <IconWarn />}
                <span className="mono">{holds}</span>
              </Link>
            ) : null}
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
