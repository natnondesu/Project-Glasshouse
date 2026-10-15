import { CATEGORY_ORDER, formatDemand, type Rack, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import { filterTemplates } from '../catalog/templateFilter';
import { TemplateFilterField } from '../catalog/TemplateFilterField';
import { Link } from 'react-router';
import { IconChevronRight, IconPlus } from '../../ui/icons';
import { TEMPLATE_MIME } from './dnd';
import { useT } from '../../i18n';

interface CatalogPaletteProps {
  catalog: Template[];
  activeRack: Rack | null;
  onAdd: (template: Template) => void;
  disabled?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function CatalogPalette({ catalog, activeRack, onAdd, disabled = false, collapsed = false, onToggle }: CatalogPaletteProps) {
  const m = useT();
  const [query, setQuery] = useState('');
  const shown = filterTemplates(catalog, query, (t) => m.categories[t.category]);
  // Grouped as on the Catalog screen; within a group, rack devices before the Nodes that go in a Chassis.
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: shown.filter((t) => t.category === category).sort((a, b) => Number(a.mounting === 'slot') - Number(b.mounting === 'slot')),
  })).filter((g) => g.items.length > 0);
  return (
    <section className="palette" aria-labelledby="palette-h">
      <div className="palette__head">
        {onToggle ? (
          <button
            type="button"
            className={`palette__toggle${collapsed ? '' : ' is-open'}`}
            aria-expanded={!collapsed}
            aria-label={collapsed ? m.palette.expand : m.palette.collapse}
            onClick={onToggle}
          >
            <IconChevronRight />
          </button>
        ) : null}
        <h2 id="palette-h">{m.palette.title}</h2>
        <Link to="/catalog" className="palette__edit">
          {m.palette.edit}
        </Link>
      </div>
      {collapsed ? null : (
        <>
      <p className="palette__note">
        {disabled ? m.palette.frozen : m.palette.dragHint(activeRack?.name ?? null)}
      </p>
      <TemplateFilterField id="palette-filter" value={query} onChange={setQuery} shown={shown.length} total={catalog.length} />
          {groups.map(({ category, items }) => (
      <section key={category} className="palette__group" aria-labelledby={`palette-${category}`}>
      <h3 id={`palette-${category}`} className="palette__group-h">
        {m.categories[category]}
        <span className="palette__count mono">{items.length}</span>
      </h3>
      <ul className="palette__list">
        {items.map((t) => (
          <li
            key={t.id}
            className={`palette__item palette__item--${t.mounting === 'slot' ? 'slot' : t.category}`}
            draggable={!disabled && t.mounting === 'rack'}
            onDragStart={(e) => {
              e.dataTransfer.setData(TEMPLATE_MIME, t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="stamp">{t.mounting === 'slot' ? m.palette.slot : `${t.heightU}U`}</span>
            <span className="palette__label">{t.label}</span>
            <span className="palette__w mono">{formatDemand(t.demand)}</span>
            {t.mounting === 'rack' && disabled ? null : t.mounting === 'rack' && activeRack ? (
              <button type="button" className="icon-btn icon-btn--sm" aria-label={m.palette.add(t.label, activeRack.name)} title={m.palette.addTo(activeRack.name)} onClick={() => onAdd(t)}>
                <IconPlus />
              </button>
            ) : (
              <span className="palette__hint" title={m.palette.inChassisHint}>
                {m.palette.inChassis}
              </span>
            )}
          </li>
        ))}
      </ul>
      </section>
      ))}
        </>
      )}
    </section>
  );
}
