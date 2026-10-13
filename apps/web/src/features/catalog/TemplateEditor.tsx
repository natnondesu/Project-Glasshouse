import { CATEGORY_LABEL, newId, type Category, type Template } from '@glasshouse/domain';
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

export const CATEGORY_ORDER: Category[] = ['compute', 'chassis', 'network', 'storage', 'power'];

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
        <h2>{mode === 'create' ? 'New template' : initial.label}</h2>
        {mode === 'edit' ? <span className="stamp">v{initial.version}</span> : null}
      </header>
      {initial.illustrative ? <p className="inspector__note">Illustrative sample. Saving changes makes it your own Template.</p> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${draft.id}-label`} label="Name" value={draft.label} onCommit={(v) => set({ label: v })} />
        <TextField id={`${draft.id}-model`} label="Manufacturer / model" value={draft.model} onCommit={(v) => set({ model: v })} />
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${draft.id}-category`} className="field__label">
              Category
            </label>
            <div className="field__box">
              <select id={`${draft.id}-category`} className="field__input" value={draft.category} onChange={(e) => chooseCategory(e.target.value as Category)}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c} disabled={isSlot && c !== 'compute'}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <span className="field__label">Mounting</span>
            <div className="seg seg--compact" role="group" aria-label="Mounting">
              <button type="button" aria-pressed={!isSlot} onClick={() => set({ mounting: 'rack' })}>
                Rack
              </button>
              <button type="button" aria-pressed={isSlot} disabled={isChassis} onClick={() => set({ mounting: 'slot', category: 'compute' })}>
                Chassis slot
              </button>
            </div>
          </div>
        </div>
      </fieldset>

      {isSlot ? (
        <p className="inspector__note">A Node takes a Chassis Slot and no rack units.</p>
      ) : (
        <fieldset className="inspector__group">
          <legend className="lbl">Size</legend>
          <div className="field-pair">
            <NumberField id={`${draft.id}-u`} label="Height" unit="U" decimals={0} value={draft.heightU} onCommit={(v) => (v === null ? null : set({ heightU: v }))} />
            <NumberField id={`${draft.id}-depth`} label="Depth" unit="mm" decimals={0} value={draft.depthMm} onCommit={(v) => (v === null ? null : set({ depthMm: v }))} />
          </div>
          {isChassis ? (
            <div className="field-pair">
              <NumberField id={`${draft.id}-slots`} label="Slots" decimals={0} value={draft.slotCount} onCommit={(v) => (v === null ? null : set({ slotCount: v }))} />
              <NumberField id={`${draft.id}-per-row`} label="Slots per row" decimals={0} value={draft.slotsPerRow} onCommit={(v) => (v === null ? null : set({ slotsPerRow: v }))} />
            </div>
          ) : null}
        </fieldset>
      )}

      <fieldset className="inspector__group">
        <legend className="lbl">Power and configuration</legend>
        <DemandField id={`${draft.id}-demand`} label={isChassis ? 'Chassis overhead' : 'Demand'} value={draft.demand} onCommit={(d) => set({ demand: d })} />
        <TextField id={`${draft.id}-config`} label="Default configuration" multiline value={draft.defaultConfig} onCommit={(v) => set({ defaultConfig: v })} />
      </fieldset>

      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      <div className="tpl-editor__actions">
        <button type="submit" className="btn btn--ink" disabled={mode === 'edit' && !dirty}>
          Save template
        </button>
        <button type="button" className="btn btn--quiet" disabled={!dirty} onClick={() => setDraft(initial)}>
          Discard changes
        </button>
      </div>
      {mode === 'edit' ? (
        <div className="inspector__danger">
          {confirmDelete ? (
            <>
              <span>Delete {initial.label}? Devices already placed keep their copy.</span>
              <button type="button" className="btn btn--sm btn--danger" onClick={remove}>
                Delete
              </button>
              <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
              Delete template
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
