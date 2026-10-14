import { cutOutKind, type CutOutKind, type Rect } from '@glasshouse/domain';
import { IconTrash } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import type { CommitFn } from './usePlanGestures';
import { useT } from '../../i18n';

interface FloorRectListProps {
  title: string;
  itemLabel: string;
  rects: Rect[];
  commit: CommitFn;
  emptyText: string;
  /** Cut-outs choose between a void and a wall/column. */
  withKind?: boolean;
}

const KINDS: CutOutKind[] = ['solid', 'void'];

const FIELDS = [
  ['x', 'X'],
  ['y', 'Y'],
  ['w', 'W'],
  ['d', 'D'],
] as const;

export function FloorRectList({ title, itemLabel, rects, commit, emptyText, withKind = false }: FloorRectListProps) {
  const m = useT();
  return (
    <fieldset className="inspector__group">
      <legend className="lbl">{title}</legend>
      {rects.length === 0 ? <p className="inspector__empty">{emptyText}</p> : null}
      <ol className="rect-list">
        {rects.map((r, i) => (
          <li key={r.id} className="rect-list__item">
            <div className="rect-list__head">
              <span className="rect-list__name">{m.survey.item(itemLabel, i + 1)}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={m.survey.removeItem(itemLabel, i + 1)}
                onClick={() => commit({ type: 'floor/remove', id: r.id })}
              >
                <IconTrash />
              </button>
            </div>
            {withKind ? (
              <div className="seg seg--compact rect-list__kind" role="group" aria-label={m.survey.kindOf(itemLabel, i + 1)}>
                {KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-label={m.survey.kindChoice(itemLabel, i + 1, m.survey.kind[kind])}
                    aria-pressed={cutOutKind(r) === kind}
                    onClick={() => commit({ type: 'floor/update', id: r.id, patch: { kind } })}
                  >
                    {m.survey.kind[kind]}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="field-quad">
              {FIELDS.map(([key, label]) => (
                <NumberField
                  key={key}
                  id={`${r.id}-${key}`}
                  label={label}
                  unit="m"
                  value={r[key]}
                  onCommit={(v) => (v === null ? null : commit({ type: 'floor/update', id: r.id, patch: { [key]: v } }, `floor:${r.id}:${key}`))}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
