import { formatWatts, newId, sumDemand, type Chassis, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';

interface SlotMapProps {
  chassis: Chassis;
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string) => void;
}

export function SlotMap({ chassis, catalog, commit, onSelect }: SlotMapProps) {
  const slotTemplates = catalog.filter((t) => t.mounting === 'slot');
  const [templateId, setTemplateId] = useState(slotTemplates[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const template = slotTemplates.find((t) => t.id === templateId) ?? slotTemplates[0] ?? null;
  const nodes = sumDemand(chassis.nodes.map((n) => n.demand));
  const total = sumDemand([chassis.demand, ...chassis.nodes.map((n) => n.demand)]);
  const headingId = `${chassis.id}-slots`;

  // Selection stays on the Chassis so every empty slot can be filled in a row.
  const insert = (slot: number): void => {
    if (!template) {
      setError('Add a Node template to the Catalog first.');
      return;
    }
    setError(commit({ type: 'node/insert', id: newId(), chassisId: chassis.id, slot, template }));
  };

  return (
    <section className="slot-map" aria-labelledby={headingId}>
      <div className="slot-map__head">
        <h3 id={headingId}>Slot map</h3>
        <span className="mono slot-map__count">{`${chassis.nodes.length} of ${chassis.slotCount} filled`}</span>
      </div>
      {slotTemplates.length > 1 ? (
        <div className="field">
          <label htmlFor={`${chassis.id}-node-tpl`} className="field__label">
            Node template
          </label>
          <div className="field__box">
            <select id={`${chassis.id}-node-tpl`} className="field__input" value={template?.id ?? ''} onChange={(e) => setTemplateId(e.target.value)}>
              {slotTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="slot-map__grid" style={{ gridTemplateColumns: `repeat(${chassis.slotsPerRow}, minmax(0, 1fr))` }}>
        {Array.from({ length: chassis.slotCount }, (_, i) => i + 1).map((slot) => {
          const node = chassis.nodes.find((n) => n.slot === slot);
          if (!node) {
            return (
              <button key={slot} type="button" className="slot slot--empty" aria-label={`Add node to slot ${slot}`} onClick={() => insert(slot)}>
                <span className="slot__n mono">{slot}</span>
                <span className="slot__add">Add node</span>
              </button>
            );
          }
          return (
            <button key={slot} type="button" className={`slot${node.demand.kind === 'unknown' ? ' slot--unknown' : ''}`} aria-label={`Slot ${slot}: ${node.name}`} onClick={() => onSelect(node.id)}>
              <span className="slot__n mono">{slot}</span>
              <span className="slot__name mono">{node.name}</span>
              <span className="slot__w mono">{node.demand.kind === 'known' ? `${node.demand.watts} W` : '? W'}</span>
            </button>
          );
        })}
      </div>
      <dl className="slot-map__sum">
        <dt>Chassis overhead</dt>
        <dd className="mono">{chassis.demand.kind === 'known' ? formatWatts(chassis.demand.watts) : 'unknown'}</dd>
        <dt>{`Nodes (${chassis.nodes.length - nodes.unknownCount} known)`}</dt>
        <dd className="mono">{formatWatts(nodes.knownW)}</dd>
        <dt>Assembly</dt>
        <dd className="mono">{`${formatWatts(total.knownW)}${total.unknownCount ? ` + ${total.unknownCount} unknown` : ''}`}</dd>
      </dl>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
