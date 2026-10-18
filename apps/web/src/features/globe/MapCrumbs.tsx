import { Fragment } from 'react';
import { useT } from '../../i18n';
import { IconChevronRight } from '../../ui/icons';

export interface Crumb {
  key: 'world' | 'country' | 'province' | 'site';
  label: string;
  go: () => void;
}

/** World › Country › Province › Site: where the selected site (or the view) is; each step flies there. */
export function MapCrumbs({ crumbs, current }: { crumbs: Crumb[]; current: Crumb['key'] }) {
  const m = useT();
  return (
    <nav className="globe-crumbs popover-surface" aria-label={m.globe.levels}>
      <ol>
        {crumbs.map((c, i) => (
          <Fragment key={c.key}>
            {i > 0 ? (
              <li className="globe-crumbs__sep" aria-hidden="true">
                <IconChevronRight />
              </li>
            ) : null}
            <li>
              <button type="button" className={`globe-crumbs__item${c.key === current ? ' is-current' : ''}`} aria-current={c.key === current ? 'location' : undefined} title={c.label} onClick={c.go}>
                {c.label}
              </button>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
