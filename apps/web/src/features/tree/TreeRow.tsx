import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconArchive, IconChevronRight, IconPencil, IconPlus, IconRestore, IconTrash } from '../../ui/icons';
import { InlineRename } from './InlineRename';
import { useT } from '../../i18n';

type Kind = 'project' | 'site' | 'room';

interface TreeRowProps {
  kind: Kind;
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
  /** False hides rename and delete (a viewer's tree). */
  canEdit?: boolean;
  /** False hides delete only (a project is the Admin's to remove). */
  canDelete?: boolean;
  onDelete: () => void;
  deleteWarning: string;
  /** Archived (itself or through a parent): greyed, and nothing here can be renamed or added to. */
  archived?: boolean;
  /** An admin's Archive or Restore; omitted for everyone else. `restoreFirst` is why Restore can't work yet. */
  archiveActions?: { onArchive: () => void; onRestore: () => void; restoreFirst: string | null };
  children?: ReactNode;
  /** Projects and sites fold; rooms don't. Undefined means not collapsible. */
  expanded?: boolean;
  onToggle?: () => void;
}

export function TreeRow(props: TreeRowProps) {
  const { kind, label, to, active = false, badge, editing, onAdd, addLabel, children, expanded, onToggle, canEdit = true, canDelete = true, archived = false, archiveActions } = props;
  const [confirming, setConfirming] = useState(false);
  const m = useT();

  let line: ReactNode;
  if (editing) {
    line = <InlineRename label={m.tree.nameOf(m.tree.kind[kind])} initial={label} onCommit={props.onRename} onDone={props.onStopEdit} />;
  } else if (confirming) {
    line = (
      <div className="tree-row__confirm" role="group" aria-label={m.tree.confirmDelete(label)}>
        <span>{props.deleteWarning}</span>
        <span className="tree-row__confirm-actions">
          <button type="button" className="btn btn--sm btn--danger" onClick={() => { setConfirming(false); props.onDelete(); }}>
            {m.tree.delete}
          </button>
          <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirming(false)}>
            {m.common.cancel}
          </button>
        </span>
      </div>
    );
  } else {
    line = (
      <div className="tree-row__line">
        {onToggle ? (
          <button
            type="button"
            className={`tree-row__toggle${expanded ? ' is-open' : ''}`}
            aria-expanded={expanded}
            aria-label={expanded ? m.tree.collapse(label) : m.tree.expand(label)}
            onClick={onToggle}
          >
            <IconChevronRight />
          </button>
        ) : null}
        {to ? (
          <Link to={to} className={`tree-row__label${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="tree-row__name">{label}</span>
            {badge}
          </Link>
        ) : (
          <span className="tree-row__label tree-row__label--group">
            <span className="tree-row__name">{label}</span>
            {badge}
          </span>
        )}
        <span className="tree-row__actions">
          {onAdd && addLabel ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={addLabel} title={addLabel} onClick={onAdd}>
              <IconPlus />
            </button>
          ) : null}
          {archiveActions && !archived ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.archive.archiveOf(label)} title={m.archive.archive} onClick={archiveActions.onArchive}>
              <IconArchive />
            </button>
          ) : null}
          {archiveActions && archived ? (
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label={archiveActions.restoreFirst ? `${m.archive.restoreOf(label)}. ${archiveActions.restoreFirst}` : m.archive.restoreOf(label)}
              aria-disabled={archiveActions.restoreFirst ? true : undefined}
              title={archiveActions.restoreFirst ?? m.archive.restore}
              onClick={archiveActions.onRestore}
            >
              <IconRestore />
            </button>
          ) : null}
          {canEdit && !archived ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.tree.renameOf(label)} title={m.tree.rename} onClick={props.onStartEdit}>
              <IconPencil />
            </button>
          ) : null}
          {canEdit && canDelete ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={m.tree.deleteOf(label)} title={m.tree.delete} onClick={() => setConfirming(true)}>
              <IconTrash />
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <li className={`tree-row tree-row--${kind}${archived ? ' tree-row--archived' : ''}`}>
      {line}
      {expanded === false ? null : children}
    </li>
  );
}
