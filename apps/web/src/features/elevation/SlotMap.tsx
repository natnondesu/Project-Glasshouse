import { formatWatts, newId, sumDemand, type Chassis, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { useT } from '../../i18n';

interface SlotMapProps {
  chassis: Chassis;
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string) => void;
}

export function SlotMap({ chassis, catalog, commit, onSelect }: SlotMapProps) {
  const m = useT();
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
      setError(m.slotMap.needNodeTemplate);
      return;
    }
    setError(commit({ type: 'node/insert', id: newId(), chassisId: chassis.id, slot, template }));
  };

  return (
    <section className="slot-map" aria-labelledby={headingId}>
      <div className="slot-map__head">
        <h3 id={headingId}>{m.slotMap.title}</h3>
        <span className="mono slot-map__count">{m.slotMap.filled(chassis.nodes.length, chassis.slotCount)}</span>
      </div>
      {slotTemplates.length > 1 ? (
        <div className="field">
          <label htmlFor={`${chassis.id}-node-tpl`} className="field__label">
            {m.slotMap.nodeTemplate}
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
              <button key={slot} type="button" className="slot slot--empty" aria-label={m.slotMap.addNodeTo(slot)} onClick={() => insert(slot)}>
                <span className="slot__n mono">{slot}</span>
                <span className="slot__add">{m.slotMap.addNode}</span>
              </button>
            );
          }
          return (
            <button key={slot} type="button" className={`slot${node.demand.kind === 'unknown' ? ' slot--unknown' : ''}`} aria-label={m.slotMap.slotOf(slot, node.name)} onClick={() => onSelect(node.id)}>
              <span className="slot__n mono">{slot}</span>
              <span className="slot__name mono">{node.name}</span>
              <span className="slot__w mono">{node.demand.kind === 'known' ? `${node.demand.watts} W` : '? W'}</span>
            </button>
          );
        })}
      </div>
      <dl className="slot-map__sum">
        <dt>{m.slotMap.overhead}</dt>
        <dd className="mono">{chassis.demand.kind === 'known' ? formatWatts(chassis.demand.watts) : m.slotMap.unknown}</dd>
        <dt>{m.slotMap.nodesKnown(chassis.nodes.length - nodes.unknownCount)}</dt>
        <dd className="mono">{formatWatts(nodes.knownW)}</dd>
        <dt>{m.slotMap.assembly}</dt>
        <dd className="mono">{`${formatWatts(total.knownW)}${m.elevation.unknownSuffix(total.unknownCount)}`}</dd>
      </dl>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
