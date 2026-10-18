import { forwardRef } from 'react';
import { useT } from '../../i18n';
import { IconPlus } from '../../ui/icons';
import { ROOM_FILTERS, type RoomFilter } from './homeRooms';
import { RoomCard } from './RoomCard';
import type { RoomSummary } from './rooms';

interface RoomsSectionProps {
  /** Null on the world view ("All rooms"); else the scope's name ("Rooms in Bangna campus"). */
  scopeLabel: string | null;
  query: string;
  filter: RoomFilter;
  counts: Record<RoomFilter, number>;
  rooms: RoomSummary[];
  /** Rooms in scope before the search and the chip: tells "none yet" from "none match". Null while pending. */
  inScope: number | null;
  lastRoomId: string | null;
  /** Set when exactly one site is in scope and the person can edit: a room needs a site. */
  newRoomSite: { name: string; add: () => void } | null;
  onFilter: (filter: RoomFilter) => void;
  onShowAll: () => void;
  onClear: () => void;
}

/** Every room in the globe's scope as a card on paper, with status chips; Show all clears the scope. */
export const RoomsSection = forwardRef<HTMLHeadingElement, RoomsSectionProps>(function RoomsSection(
  { scopeLabel, query, filter, counts, rooms, inScope, lastRoomId, newRoomSite, onFilter, onShowAll, onClear },
  heading,
) {
  const m = useT();
  const filtered = query.trim() !== '' || filter !== 'all';
  const addCard = newRoomSite ? (
    <button type="button" className="home-add" onClick={newRoomSite.add}>
      <IconPlus className="home-add__icon" />
      <span className="home-add__title">{m.home.newRoomIn(newRoomSite.name)}</span>
      <span className="home-add__body">{m.home.addRoomBody}</span>
    </button>
  ) : null;
  return (
    <section className="home-rooms" aria-labelledby="home-rooms-h">
      <div className="home-rooms__bar">
        <h2 id="home-rooms-h" ref={heading} tabIndex={-1} className="home-rooms__head">
          {scopeLabel ? m.home.roomsIn(scopeLabel) : m.home.allRooms}
        </h2>
        {scopeLabel ? (
          <button type="button" className="home-rooms__all" onClick={onShowAll}>
            {m.home.showAll}
          </button>
        ) : null}
        <div className="seg seg--compact home-rooms__chips" role="group" aria-label={m.home.filterLabel}>
          {ROOM_FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(f)}>
              {m.home.filters[f]}
              <span className="home-rooms__n">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>
      {inScope === null ? (
        <p className="home-rooms__empty" role="status">
          {m.home.findingSites}
        </p>
      ) : rooms.length > 0 || (addCard && !filtered) ? (
        <div className="home-rooms__grid">
          {rooms.map((r) => (
            <RoomCard key={r.room.id} summary={r} lastOpened={r.room.id === lastRoomId} />
          ))}
          {addCard}
        </div>
      ) : (
        <div className="home-rooms__empty">
          <p role="status">{inScope === 0 && !filtered ? m.home.noRoomsIn(scopeLabel ?? m.home.everywhere) : query.trim() ? m.home.noMatchQuery(query.trim()) : m.home.noMatch}</p>
          {filtered ? (
            <button type="button" className="btn btn--sm" onClick={onClear}>
              {m.home.clearFilters}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
});
