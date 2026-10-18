import type { RoomLocation } from '@glasshouse/domain';
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useMatch } from 'react-router';
import { useT } from '../../i18n';
import { IconChevronDown, IconChevronRight } from '../../ui/icons';
import { RoomSwitcher } from './RoomSwitcher';
import './roomnav.css';

/** Whether a name is cut short by its ellipsis, so its hint can carry the full name. */
function useIsTruncated<T extends HTMLElement>(text: string): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = (): void => setTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  return [ref, truncated];
}

/**
 * Project › Site › Room in the title block. The project goes Home; the room (and its site) open the
 * switcher, so moving to the next room is one click without the project tree.
 */
export function RoomCrumbs({ location, isSample }: { location: RoomLocation; isSample: boolean }) {
  const m = useT();
  const view = useMatch('/rooms/:roomId/:view')?.params.view ?? 'plan';
  const [open, setOpen] = useState<null | 'site' | 'room'>(null);
  const siteButton = useRef<HTMLButtonElement>(null);
  const roomButton = useRef<HTMLButtonElement>(null);
  const [projectName, projectCut] = useIsTruncated<HTMLSpanElement>(location.project.name);
  const [siteName, siteCut] = useIsTruncated<HTMLSpanElement>(location.site.name);
  const [roomName, roomCut] = useIsTruncated<HTMLSpanElement>(location.room.name);
  const anchor = open === 'site' ? siteButton.current : open === 'room' ? roomButton.current : null;

  const close = useCallback(
    (refocus: boolean) => {
      const from = open === 'site' ? siteButton.current : roomButton.current;
      setOpen(null);
      if (refocus) from?.focus();
    },
    [open],
  );
  const toggle = (which: 'site' | 'room'): void => setOpen(open === which ? null : which);
  const onKey = (which: 'site' | 'room') => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    setOpen(which);
  };

  return (
    <nav className="crumbs" aria-label={m.roomNav.breadcrumb}>
      <ol className="crumbs__list">
        <li className="crumbs__item crumbs__item--project">
          <Link to="/" className="crumbs__link" data-hint={m.roomNav.crumbHint(location.project.name, m.roomNav.toHome, projectCut)}>
            <span ref={projectName} className="crumbs__name">
              {location.project.name}
            </span>
          </Link>
          {isSample ? <span className="stamp crumbs__stamp">{m.common.sample}</span> : null}
          <IconChevronRight className="crumbs__sep" aria-hidden="true" />
        </li>
        <li className="crumbs__item crumbs__item--site">
          <button
            ref={siteButton}
            type="button"
            className="crumbs__btn"
            aria-haspopup="dialog"
            aria-expanded={open === 'site'}
            data-hint={m.roomNav.crumbHint(location.site.name, m.roomNav.siteRooms, siteCut)}
            onClick={() => toggle('site')}
            onKeyDown={onKey('site')}
          >
            <span ref={siteName} className="crumbs__name">
              {location.site.name}
            </span>
          </button>
          <IconChevronRight className="crumbs__sep" aria-hidden="true" />
        </li>
        <li className="crumbs__item crumbs__item--room">
          <button
            ref={roomButton}
            type="button"
            className="crumbs__btn crumbs__btn--room"
            aria-haspopup="dialog"
            aria-expanded={open === 'room'}
            aria-current="page"
            data-hint={m.roomNav.crumbHint(location.room.name, m.roomNav.switchRoom, roomCut)}
            onClick={() => toggle('room')}
            onKeyDown={onKey('room')}
          >
            <span ref={roomName} className="crumbs__name">
              {location.room.name}
            </span>
            <IconChevronDown className="crumbs__caret" aria-hidden="true" />
          </button>
        </li>
      </ol>
      {open && anchor ? <RoomSwitcher project={location.project} roomId={location.room.id} view={view} siteId={open === 'site' ? location.site.id : null} anchor={anchor} onClose={close} /> : null}
    </nav>
  );
}
