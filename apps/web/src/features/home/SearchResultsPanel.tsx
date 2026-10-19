import type { KeyboardEvent, MouseEvent } from 'react';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconBlock, IconMapPin, IconWarn } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { highlight } from './highlight';
import type { RoomSummary } from './rooms';
import type { ResultSection, SearchOption, SearchResults } from './searchResults';

function Marked({ text, words }: { text: string; words: readonly string[] }) {
  return (
    <>
      {highlight(text, words).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

function RoomHolds({ room }: { room: RoomSummary }) {
  const m = useT();
  const { blocks, needsAck } = room.holds;
  if (blocks === 0 && needsAck === 0) return null;
  return (
    <span className="home-find__holds">
      {blocks > 0 ? (
        <span className="home-find__hold home-find__hold--block">
          <IconBlock aria-hidden="true" />
          {m.home.blocks(blocks)}
        </span>
      ) : null}
      {needsAck > 0 ? (
        <span className="home-find__hold home-find__hold--ack">
          <IconWarn aria-hidden="true" />
          {m.checks.needsAck(needsAck)}
        </span>
      ) : null}
    </span>
  );
}

function OptionBody({ option, words }: { option: SearchOption; words: readonly string[] }) {
  const m = useT();
  switch (option.kind) {
    case 'site': {
      const { site } = option;
      return (
        <>
          <span className="home-find__name">
            <span className="home-find__text">
              <Marked text={site.site.name} words={words} />
            </span>
          </span>
          <span className="home-find__meta">
            <Marked text={site.project.name} words={words} />
            {` · ${m.globe.rooms(site.rooms.length)}`}
            {site.location ? null : <span className="home-find__unplaced">{` · ${m.home.notOnMap}`}</span>}
          </span>
        </>
      );
    }
    case 'room': {
      const { room } = option;
      return (
        <>
          <span className="home-find__name">
            <span className="home-find__text">
              <Marked text={room.room.name} words={words} />
            </span>
            <span className={`stamp stamp--${room.revision.state}`}>{`R${pad2(room.revision.number)} ${m.revision.stamp[room.revision.state]}`}</span>
          </span>
          <span className="home-find__meta">
            <Marked text={room.site.name} words={words} />
            {' · '}
            <Marked text={room.project.name} words={words} />
          </span>
          <RoomHolds room={room} />
        </>
      );
    }
    case 'project':
      return (
        <>
          <span className="home-find__name">
            <span className="home-find__text">
              <Marked text={option.project.project.name} words={words} />
            </span>
          </span>
          <span className="home-find__meta">{m.home.projectCounts(option.project.sites, option.project.rooms)}</span>
        </>
      );
    case 'more':
      return <span className="home-find__more">{m.home.showAllIn(option.total, m.home.resultGroups[option.group])}</span>;
    case 'map':
      return (
        <span className="home-find__more">
          <IconMapPin aria-hidden="true" />
          {m.home.showAllOnMap(option.ids.length)}
        </span>
      );
  }
}

interface SearchResultsPanelProps {
  listId: string;
  query: string;
  words: readonly string[];
  results: SearchResults;
  sections: ResultSection[];
  active: number;
  optionId: (index: number) => string;
  onPick: (option: SearchOption) => void;
  onOpenKey: (e: KeyboardEvent<HTMLAnchorElement>) => void;
  onOpened: () => void;
  onClear: () => void;
}

const keepFocus = (e: MouseEvent): void => e.preventDefault();

/** The dropdown under Home's search: a solid listbox of grouped results, or a plain "nothing matches". */
export function SearchResultsPanel({ listId, query, words, results, sections, active, optionId, onPick, onOpenKey, onOpened, onClear }: SearchResultsPanelProps) {
  const m = useT();
  if (sections.length === 0) {
    return (
      <div className="home-find__panel home-find__panel--empty popover-surface">
        <p className="home-find__empty">{m.home.noResults(query.trim())}</p>
        <p className="home-find__hint">{m.home.noResultsHint}</p>
        <button type="button" className="btn btn--sm" onMouseDown={keepFocus} onClick={onClear}>
          {m.home.clear}
        </button>
      </div>
    );
  }
  let index = -1;
  const option = (o: SearchOption) => {
    index += 1;
    const i = index;
    const roomId = o.kind === 'room' ? o.room.room.id : null;
    const node = (
      <div
        key={roomId ? undefined : i}
        id={optionId(i)}
        role="option"
        aria-selected={i === active}
        aria-describedby={roomId ? `${listId}-open-hint` : undefined}
        className={`home-find__option home-find__option--${o.kind}`}
        onMouseDown={keepFocus}
        onClick={() => onPick(o)}
      >
        <OptionBody option={o} words={words} />
      </div>
    );
    if (o.kind !== 'room') return node;
    return (
      <div key={i} role="none" className={`home-find__row${i === active ? ' is-active' : ''}`}>
        {node}
        <Link to={`/rooms/${o.room.room.id}/plan`} className="btn btn--sm home-find__open" tabIndex={-1} data-open-for={i} aria-label={m.globe.openRoom(o.room.room.name)} onKeyDown={onOpenKey} onClick={onOpened}>
          {m.home.open}
        </Link>
      </div>
    );
  };
  const totals = { sites: results.sites.all.length, rooms: results.rooms.all.length, projects: results.projects.all.length };
  return (
    <div className="home-find__panel popover-surface">
      <div role="listbox" id={listId} aria-label={m.home.searchResults} className="home-find__list">
        {sections.map((section) =>
          section.group === 'map' ? (
            <div key="map" role="none" className="home-find__foot">
              {section.options.map(option)}
            </div>
          ) : (
            <div key={section.group} role="group" aria-labelledby={`${listId}-${section.group}`} className="home-find__group">
              <div role="presentation" id={`${listId}-${section.group}`} className="home-find__head">
                <span>{m.home.resultGroups[section.group]}</span>
                <span className="mono">{totals[section.group]}</span>
              </div>
              {section.options.map(option)}
            </div>
          ),
        )}
      </div>
      <span id={`${listId}-open-hint`} className="visually-hidden">
        {m.home.openHint}
      </span>
    </div>
  );
}
