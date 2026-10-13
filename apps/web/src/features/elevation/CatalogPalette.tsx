import { formatDemand, type Rack, type Template } from '@glasshouse/domain';
import { Link } from 'react-router';
import { IconPlus } from '../../ui/icons';
import { TEMPLATE_MIME } from './dnd';

interface CatalogPaletteProps {
  catalog: Template[];
  activeRack: Rack | null;
  onAdd: (template: Template) => void;
  disabled?: boolean;
}

export function CatalogPalette({ catalog, activeRack, onAdd, disabled = false }: CatalogPaletteProps) {
  return (
    <section className="palette" aria-labelledby="palette-h">
      <div className="palette__head">
        <h2 id="palette-h">Catalog</h2>
        <Link to="/catalog" className="palette__edit">
          Edit catalog
        </Link>
      </div>
      <p className="palette__note">
        {disabled ? 'This Revision is frozen. Start a new draft to add Devices.' : `Drag onto a rack, or add to ${activeRack ? activeRack.name : 'the selected rack'} at its lowest free U.`}
      </p>
      <ul className="palette__list">
        {catalog.map((t) => (
          <li
            key={t.id}
            className={`palette__item palette__item--${t.mounting === 'slot' ? 'slot' : t.category}`}
            draggable={!disabled && t.mounting === 'rack'}
            onDragStart={(e) => {
              e.dataTransfer.setData(TEMPLATE_MIME, t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="stamp">{t.mounting === 'slot' ? 'SLOT' : `${t.heightU}U`}</span>
            <span className="palette__label">{t.label}</span>
            <span className="palette__w mono">{formatDemand(t.demand)}</span>
            {t.mounting === 'rack' && disabled ? null : t.mounting === 'rack' && activeRack ? (
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Add ${t.label} to ${activeRack.name}`} title={`Add to ${activeRack.name}`} onClick={() => onAdd(t)}>
                <IconPlus />
              </button>
            ) : (
              <span className="palette__hint" title="Add from a Chassis slot map">
                in Chassis
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
