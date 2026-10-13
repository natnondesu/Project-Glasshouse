import { CATEGORY_LABEL, formatDemand, SEED_TEMPLATE_IDS, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import { useSearchParamState } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { blankTemplate, CATEGORY_ORDER, TemplateEditor } from './TemplateEditor';
import '../plan/inspector.css';
import './catalog.css';

export function CatalogScreen() {
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [selectedId, select] = useSearchParamState('tpl');
  const [draft, setDraft] = useState<Template | null>(null);
  const selected = catalog.find((t) => t.id === selectedId) ?? null;
  const missing = SEED_TEMPLATE_IDS.filter((id) => !catalog.some((t) => t.id === id)).length;

  return (
    <div className="catalog">
      <section className="catalog__list glass" aria-labelledby="catalog-h">
        <header className="catalog__head">
          <h1 id="catalog-h">Device catalog</h1>
          <button
            type="button"
            className="btn btn--sm btn--ink"
            onClick={() => {
              select(null);
              setDraft(blankTemplate());
            }}
          >
            New template
          </button>
        </header>
        <p className="catalog__note">Shared by every Project in this browser. Editing a Template never changes Devices already placed.</p>
        {missing > 0 ? (
          <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'catalog/seed' })}>
            Add {missing} illustrative {missing === 1 ? 'template' : 'templates'}
          </button>
        ) : null}
        {CATEGORY_ORDER.map((category) => {
          const items = catalog.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="catalog__group">
              <h2 className="lbl">{CATEGORY_LABEL[category]}</h2>
              <ul>
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`catalog__item${t.id === selected?.id ? ' is-active' : ''}`}
                      aria-current={t.id === selected?.id ? 'true' : undefined}
                      onClick={() => {
                        setDraft(null);
                        select(t.id);
                      }}
                    >
                      <span className="catalog__name">{t.label}</span>
                      <span className="stamp">{t.mounting === 'slot' ? 'SLOT' : `${t.heightU}U`}</span>
                      <span className="catalog__w mono">{formatDemand(t.demand)}</span>
                      {t.illustrative ? <span className="catalog__flag">illustrative</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <section className="catalog__editor glass" aria-label="Template editor">
        {draft ? (
          <TemplateEditor
            key={draft.id}
            mode="create"
            initial={draft}
            onDone={(id) => {
              setDraft(null);
              if (id) select(id);
            }}
          />
        ) : selected ? (
          <TemplateEditor key={`${selected.id}:${selected.version}`} mode="edit" initial={selected} onDone={(id) => select(id)} />
        ) : (
          <p className="catalog__empty">Pick a Template to edit it, or create a new one.</p>
        )}
      </section>
    </div>
  );
}
