import { newId, type Category, type Template } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { PortGroupsField } from './PortGroupsField';
import { useT } from '../../i18n';

export const CATEGORY_ORDER: Category[] = ['compute', 'chassis', 'network', 'storage', 'power', 'misc'];

export const blankTemplate = (): Template => ({
  id: newId(),
  version: 0,
  label: '',
  model: '',
  category: 'compute',
  mounting: 'rack',
  heightU: 1,
  depthMm: 750,
  demand: { kind: 'known', watts: 300 },
  color: '',
  defaultConfig: '',
  slotCount: null,
  slotsPerRow: null,
  illustrative: false,
});

interface TemplateEditorProps {
  mode: 'create' | 'edit';
  initial: Template;
  onDone: (id: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function TemplateEditor({ mode, initial, onDone, onDirtyChange }: TemplateEditorProps) {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const m = useT();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Template>): null => {
    setDraft((d) => ({ ...d, ...patch }));
    return null;
  };
  const isSlot = draft.mounting === 'slot';
  const isChassis = draft.category === 'chassis';
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = (): void => {
    const { version: _version, ...fields } = draft;
    const { id: _id, illustrative: _illustrative, ...patch } = fields;
    const problem = mode === 'create' ? dispatch({ type: 'template/create', template: fields }) : dispatch({ type: 'template/update', id: draft.id, patch });
    setError(problem?.message ?? null);
    if (!problem) onDone(draft.id);
  };
  const remove = (): void => {
    const problem = dispatch({ type: 'template/delete', id: draft.id });
    setError(problem?.message ?? null);
    if (!problem) onDone(null);
  };
  const chooseCategory = (category: Category): void => {
    set({
      category,
      mounting: category === 'chassis' ? 'rack' : draft.mounting,
      slotCount: category === 'chassis' ? (draft.slotCount ?? 5) : null,
      slotsPerRow: category === 'chassis' ? (draft.slotsPerRow ?? 5) : null,
    });
  };

  return (
    <form
      className="tpl-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <header className="inspector__head">
        <h2>{mode === 'create' ? m.catalog.newTemplate : initial.label}</h2>
        {mode === 'edit' ? <span className="stamp">v{initial.version}</span> : null}
      </header>
      {initial.illustrative ? <p className="inspector__note">{m.catalog.illustrativeNote}</p> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">{m.catalog.identity}</legend>
        <TextField id={`${draft.id}-label`} label={m.catalog.name} value={draft.label} onCommit={(v) => set({ label: v })} />
        <TextField id={`${draft.id}-model`} label={m.catalog.model} value={draft.model} onCommit={(v) => set({ model: v })} />
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${draft.id}-category`} className="field__label">
              {m.catalog.category}
            </label>
            <div className="field__box">
              <select id={`${draft.id}-category`} className="field__input" value={draft.category} onChange={(e) => chooseCategory(e.target.value as Category)}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c} disabled={isSlot && c !== 'compute'}>
                    {m.categories[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <span className="field__label">{m.catalog.mounting}</span>
            <div className="seg seg--compact" role="group" aria-label={m.catalog.mounting}>
              <button type="button" aria-pressed={!isSlot} onClick={() => set({ mounting: 'rack' })}>
                {m.catalog.rack}
              </button>
              <button type="button" aria-pressed={isSlot} disabled={isChassis} onClick={() => set({ mounting: 'slot', category: 'compute' })}>
                {m.catalog.chassisSlot}
              </button>
            </div>
          </div>
        </div>
      </fieldset>

      {isSlot ? (
        <p className="inspector__note">{m.catalog.nodeNote}</p>
      ) : (
        <fieldset className="inspector__group">
          <legend className="lbl">{m.catalog.size}</legend>
          <div className="field-pair">
            <NumberField id={`${draft.id}-u`} label={m.catalog.height} unit="U" decimals={0} value={draft.heightU} onCommit={(v) => (v === null ? null : set({ heightU: v }))} />
            <NumberField id={`${draft.id}-depth`} label={m.catalog.depth} unit="mm" decimals={0} value={draft.depthMm} onCommit={(v) => (v === null ? null : set({ depthMm: v }))} />
          </div>
          {isChassis ? (
            <div className="field-pair">
              <NumberField id={`${draft.id}-slots`} label={m.catalog.slots} decimals={0} value={draft.slotCount} onCommit={(v) => (v === null ? null : set({ slotCount: v }))} />
              <NumberField id={`${draft.id}-per-row`} label={m.catalog.perRow} decimals={0} value={draft.slotsPerRow} onCommit={(v) => (v === null ? null : set({ slotsPerRow: v }))} />
            </div>
          ) : null}
        </fieldset>
      )}

      <fieldset className="inspector__group">
        <legend className="lbl">{m.catalog.powerConfig}</legend>
        <DemandField id={`${draft.id}-demand`} label={isChassis ? m.catalog.chassisOverhead : m.catalog.demand} value={draft.demand} onCommit={(d) => set({ demand: d })} />
        <TextField id={`${draft.id}-config`} label={m.catalog.defaultConfig} multiline value={draft.defaultConfig} onCommit={(v) => set({ defaultConfig: v })} />
      </fieldset>

      <PortGroupsField id={draft.id} groups={draft.ports ?? []} onChange={(ports) => set(ports.length ? { ports } : { ports: undefined })} />

      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      <div className="tpl-editor__actions">
        <button type="submit" className="btn btn--ink" disabled={mode === 'edit' && !dirty}>
          {m.catalog.save}
        </button>
        <button type="button" className="btn btn--quiet" disabled={!dirty} onClick={() => setDraft(initial)}>
          {m.catalog.discard}
        </button>
      </div>
      {mode === 'edit' ? (
        <div className="inspector__danger">
          {confirmDelete ? (
            <>
              <span>{m.catalog.deleteQuestion(initial.label)}</span>
              <button type="button" className="btn btn--sm btn--danger" onClick={remove}>
                {m.catalog.delete}
              </button>
              <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
                {m.common.cancel}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
              {m.catalog.deleteTemplate}
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
