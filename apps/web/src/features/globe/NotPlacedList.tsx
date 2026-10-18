import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { IconChevronDown, IconMapPin } from '../../ui/icons';
import type { SiteSummary } from './sites';

interface NotPlacedListProps {
  sites: SiteSummary[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (siteId: string) => void;
  onPlace: (siteId: string) => void;
  /** Place mode is on: the list steps out of the way but stays mounted, so focus can come back to its button. */
  hidden?: boolean;
}

/**
 * Sites with no location yet, from a button at the map's foot (with a count): nothing drops off Home just because
 * nobody has placed it. Each name picks the site; editors get Place. Escape closes the list back to its button.
 */
export function NotPlacedList({ sites, selectedId, canEdit, onSelect, onPlace, hidden = false }: NotPlacedListProps) {
  const m = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (sites.length === 0) setOpen(false);
  }, [sites.length]);
  if (sites.length === 0) return null;
  return (
    <div
      className={`globe-notplaced${open ? ' is-open' : ''}`}
      hidden={hidden}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      {open ? (
        <section className="not-placed popover-surface" aria-labelledby="not-placed-h">
          <h2 id="not-placed-h" className="not-placed__head">
            {m.globe.notPlaced}
            <span className="mono not-placed__count">{sites.length}</span>
          </h2>
          <ul className="not-placed__list">
            {sites.map((s) => (
              <li key={s.site.id} className={`not-placed__item${s.site.id === selectedId ? ' is-on' : ''}`}>
                <button type="button" className="not-placed__name" aria-pressed={s.site.id === selectedId} onClick={() => onSelect(s.site.id)}>
                  <span>{s.site.name}</span>
                  <span className="not-placed__project">{s.project.name}</span>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn--sm"
                    aria-label={m.globe.placeSite(s.site.name)}
                    onClick={() => {
                      // Place mode hands focus back to what started it: the list's button outlives the list.
                      button.current?.focus();
                      setOpen(false);
                      onPlace(s.site.id);
                    }}
                  >
                    <IconMapPin />
                    {m.globe.place}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? null : <p className="not-placed__note">{m.globe.editorsPlace}</p>}
        </section>
      ) : null}
      <button ref={button} type="button" className="globe-notplaced__toggle popover-surface" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconMapPin />
        {m.globe.notPlaced}
        <span className="mono not-placed__count">{sites.length}</span>
        <IconChevronDown className="globe-notplaced__caret" />
      </button>
    </div>
  );
}
