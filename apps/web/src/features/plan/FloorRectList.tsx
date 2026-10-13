import type { Rect } from '@glasshouse/domain';
import { IconTrash } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import type { CommitFn } from './usePlanGestures';

interface FloorRectListProps {
  title: string;
  itemLabel: string;
  rects: Rect[];
  commit: CommitFn;
  emptyText: string;
}

const FIELDS = [
  ['x', 'X'],
  ['y', 'Y'],
  ['w', 'W'],
  ['d', 'D'],
] as const;

export function FloorRectList({ title, itemLabel, rects, commit, emptyText }: FloorRectListProps) {
  return (
    <fieldset className="inspector__group">
      <legend className="lbl">{title}</legend>
      {rects.length === 0 ? <p className="inspector__empty">{emptyText}</p> : null}
      <ol className="rect-list">
        {rects.map((r, i) => (
          <li key={r.id} className="rect-list__item">
            <div className="rect-list__head">
              <span className="rect-list__name">{`${itemLabel} ${i + 1}`}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                onClick={() => commit({ type: 'floor/remove', id: r.id })}
              >
                <IconTrash />
              </button>
            </div>
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
