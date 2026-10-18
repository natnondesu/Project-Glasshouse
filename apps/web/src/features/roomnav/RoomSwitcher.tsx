import type { Project } from '@glasshouse/domain';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useT } from '../../i18n';
import { IconCheck, IconSearch } from '../../ui/icons';
import { pad2 } from '../../ui/StatusStamp';
import { filterSites, needsFilter, switcherSites } from './switcher';

/** Space kept between the popover and the window edge, and below its crumb. */
const EDGE_PX = 8;
const GAP_PX = 6;

interface RoomSwitcherProps {
  project: Project;
  roomId: string;
  /** The view to land in: switching rooms keeps you in Plan, Network or wherever you were. */
  view: string;
  /** Opened from the site crumb: start on that site's rooms. */
  siteId: string | null;
  anchor: HTMLElement;
  onClose: (refocus: boolean) => void;
}

/**
 * The rooms of the current project grouped by site, on a solid surface under the breadcrumb. Placed in the
 * page body so the glass title block (a containing block for fixed children) can't trap it.
 */
export function RoomSwitcher({ project, roomId, view, siteId, anchor, onClose }: RoomSwitcherProps) {
  const m = useT();
  const all = useMemo(() => switcherSites(project, roomId), [project, roomId]);
  const withFilter = needsFilter(all);
  const [query, setQuery] = useState('');
  const sites = filterSites(all, query);
  const panel = useRef<HTMLDivElement>(null);
  const filter = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    if (!panel.current) return;
    const a = anchor.getBoundingClientRect();
    const { width } = panel.current.getBoundingClientRect();
    const top = a.bottom + GAP_PX;
    setPos({ top, left: Math.min(Math.max(EDGE_PX, a.left - 6), window.innerWidth - EDGE_PX - width), maxHeight: window.innerHeight - top - EDGE_PX });
  }, [anchor]);

  // Only once placed, since a hidden popover cannot take focus; and only once, so filtering never moves it.
  const focused = useRef(false);
  useLayoutEffect(() => {
    if (!pos || !panel.current || focused.current) return;
    focused.current = true;
    const site = siteId ? [...panel.current.querySelectorAll<HTMLElement>('[data-site]')].find((g) => g.dataset.site === siteId) : undefined;
    const start = site
      ? site.querySelector<HTMLElement>('[role="menuitem"]')
      : withFilter
        ? filter.current
        : panel.current.querySelector<HTMLElement>('[role="menuitem"][aria-current="page"]');
    (start ?? panel.current.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
    // Focus alone would leave the site at the bottom edge; bring its name to the top.
    site?.scrollIntoView?.({ block: 'start' });
  }, [pos, siteId, withFilter]);

  useEffect(() => {
    const outside = (e: Event): void => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.contains(t)) onClose(false);
    };
    // A fixed popover would drift from its crumb when the window changes; it closes instead.
    const drift = (e: Event): void => {
      if (!panel.current?.contains(e.target as Node)) onClose(false);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', drift, true);
    window.addEventListener('resize', drift);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', drift, true);
      window.removeEventListener('resize', drift);
    };
  }, [anchor, onClose]);

  const onKeyDown = (e: KeyboardEvent): void => {
    const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number): void => {
      e.preventDefault();
      if (i < 0 && withFilter) return filter.current?.focus();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at === 0 ? -1 : at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home' && at >= 0) go(0);
    else if (e.key === 'End' && at >= 0) go(items.length - 1);
    else if (e.key === 'Enter' && at < 0 && items[0]) {
      e.preventDefault();
      items[0].click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (e.key === 'Tab') {
      // Back to the crumb first, so the browser's own Tab carries on from the title block.
      onClose(true);
    }
  };

  return createPortal(
    <div
      ref={panel}
      className="room-switcher popover-surface"
      role="dialog"
      aria-label={m.roomNav.roomsIn(project.name)}
      style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && !panel.current?.contains(next) && !anchor.contains(next)) onClose(false);
      }}
    >
      {withFilter ? (
        <label className="room-switcher__filter">
          <IconSearch aria-hidden="true" />
          <input ref={filter} type="search" aria-label={m.roomNav.filter} placeholder={m.roomNav.filter} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      ) : null}
      <div className="room-switcher__list" role="menu" aria-labelledby={titleId}>
        <span id={titleId} className="visually-hidden">
          {m.roomNav.roomsIn(project.name)}
        </span>
        {sites.length === 0 ? <p className="room-switcher__empty">{m.roomNav.noMatch(query.trim())}</p> : null}
        {sites.map((site) => (
          <div key={site.id} className="room-switcher__site" role="group" aria-label={site.name} data-site={site.id}>
            <p className="room-switcher__site-name" aria-hidden="true">
              {site.name}
            </p>
            {site.rooms.map((room) => (
              <Link
                key={room.id}
                role="menuitem"
                tabIndex={-1}
                to={`/rooms/${room.id}/${view}`}
                className={`room-switcher__room${room.current ? ' is-current' : ''}`}
                aria-current={room.current ? 'page' : undefined}
                onClick={() => onClose(true)}
              >
                <span className="room-switcher__mark">{room.current ? <IconCheck aria-hidden="true" /> : null}</span>
                <span className="room-switcher__name">{room.name}</span>
                <span className={`stamp stamp--${room.state}`}>{`R${pad2(room.number)} ${m.revision.stamp[room.state]}`}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
