import { backupDue } from '@glasshouse/domain';
import { useT } from '../../i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SERVER_MODE } from '../../sync/serverMode';
import { IconProjectTree } from '../../ui/icons';
import { PROJECT_DRAWER_ID } from '../tree/ProjectTree';
import { DRAWER_SHORTCUT_LABEL } from './placement';
import type { TreeDrawer } from './useTreeDrawer';

/**
 * Opens the project tree over a room. The tree holds the browser backup panel, so while it is out of sight
 * an overdue backup shows here as a dot, named in the button's label and hint.
 */
export function ProjectsButton({ drawer }: { drawer: TreeDrawer }) {
  const m = useT();
  const notBackedUp = useWorkspaceStore((s) => !SERVER_MODE && backupDue(s.workspace, new Date()));
  return (
    <button
      ref={drawer.buttonRef}
      type="button"
      className={`btn btn--sm projects-btn${drawer.open ? ' is-open' : ''}`}
      aria-label={m.roomNav.projectsLabel(notBackedUp)}
      aria-expanded={drawer.open}
      aria-controls={drawer.open ? PROJECT_DRAWER_ID : undefined}
      aria-keyshortcuts={DRAWER_SHORTCUT_LABEL}
      data-hint={m.roomNav.projectsHint(DRAWER_SHORTCUT_LABEL, notBackedUp)}
      onClick={drawer.toggle}
    >
      <span className="projects-btn__icon">
        <IconProjectTree />
        {notBackedUp ? <span className="projects-btn__dot" aria-hidden="true" /> : null}
      </span>
      <span className="projects-btn__label">{m.roomNav.projects}</span>
    </button>
  );
}
