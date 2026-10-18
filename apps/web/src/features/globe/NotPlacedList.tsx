import { useT } from '../../i18n';
import { IconMapPin } from '../../ui/icons';
import type { SiteSummary } from './sites';

interface NotPlacedListProps {
  sites: SiteSummary[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (siteId: string) => void;
  onPlace: (siteId: string) => void;
}

/** Sites with no location yet, under the map: nothing drops off Home just because nobody has placed it. */
export function NotPlacedList({ sites, selectedId, canEdit, onSelect, onPlace }: NotPlacedListProps) {
  const m = useT();
  if (sites.length === 0) return null;
  return (
    <section className="not-placed" aria-labelledby="not-placed-h">
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
              <button type="button" className="btn btn--sm" aria-label={m.globe.placeSite(s.site.name)} onClick={() => onPlace(s.site.id)}>
                <IconMapPin />
                {m.globe.place}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? null : <p className="not-placed__note">{m.globe.editorsPlace}</p>}
    </section>
  );
}
