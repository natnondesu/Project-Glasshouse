import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconPencil, IconPlus, IconTrash } from '../../ui/icons';
import { InlineRename } from './InlineRename';

const KIND_LABEL = { project: 'Project', site: 'Site', room: 'Room' } as const;

interface TreeRowProps {
  kind: keyof typeof KIND_LABEL;
  label: string;
  to?: string;
  active?: boolean;
  badge?: ReactNode;
  editing: boolean;
  onStartEdit: () => void;
  onRename: (name: string) => string | null;
  onStopEdit: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onDelete: () => void;
  deleteWarning: string;
  children?: ReactNode;
}

export function TreeRow(props: TreeRowProps) {
  const { kind, label, to, active = false, badge, editing, onAdd, addLabel, children } = props;
  const [confirming, setConfirming] = useState(false);

  let line: ReactNode;
  if (editing) {
    line = <InlineRename label={`${KIND_LABEL[kind]} name`} initial={label} onCommit={props.onRename} onDone={props.onStopEdit} />;
  } else if (confirming) {
    line = (
      <div className="tree-row__confirm" role="group" aria-label={`Confirm deleting ${label}`}>
        <span>{props.deleteWarning}</span>
        <span className="tree-row__confirm-actions">
          <button type="button" className="btn btn--sm btn--danger" onClick={() => { setConfirming(false); props.onDelete(); }}>
            Delete
          </button>
          <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      </div>
    );
  } else {
    line = (
      <div className="tree-row__line">
        {to ? (
          <Link to={to} className={`tree-row__label${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="tree-row__name">{label}</span>
            {badge}
          </Link>
        ) : (
          <span className="tree-row__label tree-row__label--group">
            <span className="tree-row__name">{label}</span>
          </span>
        )}
        <span className="tree-row__actions">
          {onAdd && addLabel ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={addLabel} title={addLabel} onClick={onAdd}>
              <IconPlus />
            </button>
          ) : null}
          <button type="button" className="icon-btn icon-btn--sm" aria-label={`Rename ${label}`} title="Rename" onClick={props.onStartEdit}>
            <IconPencil />
          </button>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={`Delete ${label}`} title="Delete" onClick={() => setConfirming(true)}>
            <IconTrash />
          </button>
        </span>
      </div>
    );
  }

  return (
    <li className={`tree-row tree-row--${kind}`}>
      {line}
      {children}
    </li>
  );
}
