import { formatDemand, SEED_TEMPLATE_IDS, type Template } from '@glasshouse/domain';
import { useCallback, useState } from 'react';
import { useBlocker } from 'react-router';
import { CatalogFileActions } from './CatalogFileActions';
import { useSearchParamState } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { blankTemplate, CATEGORY_ORDER, TemplateEditor } from './TemplateEditor';
import '../plan/inspector.css';
import './catalog.css';
import { useT } from '../../i18n';

export function CatalogScreen() {
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [selectedId, select] = useSearchParamState('tpl');
  const [draft, setDraft] = useState<Template | null>(null);
  const selected = catalog.find((t) => t.id === selectedId) ?? null;
  const missing = SEED_TEMPLATE_IDS.filter((id) => !catalog.some((t) => t.id === id)).length;
  const [dirty, setDirtyState] = useState(false);
  const setDirty = useCallback((d: boolean) => setDirtyState(d), []);
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Only leaving the Catalog is blocked here; switching Templates inside it goes through guard().
  const m = useT();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  const editingLabel = draft ? draft.label || 'the new template' : (selected?.label ?? 'this template');
  // Explicit Save means switching away must never drop edits silently.
  const guard = (go: () => void): void => {
    if (dirty) setPending(() => go);
    else go();
  };
  const asking = pending !== null || blocker.state === 'blocked';
  const discardAndGo = (): void => {
    setDirtyState(false);
    if (pending) {
      const go = pending;
      setPending(null);
      go();
    } else if (blocker.state === 'blocked') blocker.proceed();
  };
  const keepEditing = (): void => {
    setPending(null);
    if (blocker.state === 'blocked') blocker.reset();
  };

  return (
    <div className="catalog">
      <section className="catalog__list glass" aria-labelledby="catalog-h">
        <header className="catalog__head">
          <h1 id="catalog-h">{m.catalog.title}</h1>
          <button
            type="button"
            className="btn btn--sm btn--ink"
            onClick={() =>
              guard(() => {
                select(null);
                setDraft(blankTemplate());
              })
            }
          >
            {m.catalog.newTemplate}
          </button>
        </header>
        <p className="catalog__note">{m.catalog.note}</p>
        <CatalogFileActions guard={guard} />
        {missing > 0 ? (
          <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'catalog/seed' })}>
            {m.catalog.addDefaults(missing)}
          </button>
        ) : null}
        {CATEGORY_ORDER.map((category) => {
          const items = catalog.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="catalog__group">
              <h2 className="lbl">{m.categories[category]}</h2>
              <ul>
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`catalog__item${t.id === selected?.id ? ' is-active' : ''}`}
                      aria-current={t.id === selected?.id ? 'true' : undefined}
                      onClick={() =>
                        guard(() => {
                          setDraft(null);
                          select(t.id);
                        })
                      }
                    >
                      <span className="catalog__name">{t.label}</span>
                      <span className="stamp">{t.mounting === 'slot' ? m.catalog.slot : `${t.heightU}U`}</span>
                      <span className="catalog__w mono">{formatDemand(t.demand)}</span>
                      {t.illustrative ? <span className="catalog__flag">{m.catalog.illustrative}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <section className="catalog__editor glass" aria-label={m.catalog.editor}>
        {asking ? (
          <div className="catalog__confirm" role="group" aria-label={m.catalog.unsaved}>
            <p>{m.catalog.discardQuestion(editingLabel)}</p>
            <div className="tpl-editor__actions">
              <button type="button" className="btn btn--sm btn--danger" onClick={discardAndGo}>
                {m.catalog.discardContinue}
              </button>
              <button type="button" className="btn btn--sm" onClick={keepEditing}>
                {m.catalog.keepEditing}
              </button>
            </div>
          </div>
        ) : null}
        {draft ? (
          <TemplateEditor
            key={draft.id}
            mode="create"
            initial={draft}
            onDirtyChange={setDirty}
            onDone={(id) => {
              setDraft(null);
              if (id) select(id);
            }}
          />
        ) : selected ? (
          <TemplateEditor key={`${selected.id}:${selected.version}`} mode="edit" initial={selected} onDone={(id) => select(id)} onDirtyChange={setDirty} />
        ) : (
          <p className="catalog__empty">{m.catalog.pick}</p>
        )}
      </section>
    </div>
  );
}
