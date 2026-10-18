import { currentRevision, exportProjectFile, liveCounts } from '@glasshouse/domain';
import { useState, type ReactNode } from 'react';
import { UserMenu } from '../auth/UserMenu';
import { SERVER_MODE } from '../sync/serverMode';
import { NavLink, Link } from 'react-router';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { useT } from '../i18n';
import { useRoomLocation, useViewedRevisionNumber } from '../store/hooks';
import { useWorkspaceStore, type SaveState } from '../store/workspaceStore';
import { downloadJson, slugify } from '../ui/files';
import { IconCatalog, IconDownload } from '../ui/icons';
import { pad2, StatusStamp } from '../ui/StatusStamp';
import { ProjectsButton } from '../features/roomnav/ProjectsButton';
import { RoomCrumbs } from '../features/roomnav/RoomCrumbs';
import type { TreeDrawer } from '../features/roomnav/useTreeDrawer';

function Cell({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="title-block__cell">
      <dt className="lbl">{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children}</dd>
    </div>
  );
}

const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function SaveStatus({ save }: { save: SaveState }) {
  const m = useT();
  switch (save.kind) {
    case 'idle':
      return <span className="save-status">{SERVER_MODE ? m.shell.serverIdle : m.shell.saveIdle}</span>;
    case 'saving':
      return <span className="save-status">{m.shell.saving}</span>;
    case 'saved':
      return <span className="save-status">{SERVER_MODE ? m.shell.savedServer(time(save.at)) : m.shell.saved(time(save.at))}</span>;
    case 'failed':
      return (
        <span className="save-status save-status--failed" role="alert">
          {m.shell.saveFailed(save.reason)}
        </span>
      );
  }
}

/** `drawer` is the project drawer on a room screen while the tree isn't pinned; null elsewhere. */
export function TitleBlock({ roomId, drawer = null }: { roomId: string | null; drawer?: TreeDrawer | null }) {
  const location = useRoomLocation(roomId);
  const save = useWorkspaceStore((s) => s.save);
  const viewedNumber = useViewedRevisionNumber();
  const viewed = location && viewedNumber !== null ? location.room.plan.revisions.find((r) => r.number === viewedNumber) : undefined;
  const revision = viewed ?? (location ? currentRevision(location.room.plan) : null);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const counts = liveCounts(workspace);
  const [exportError, setExportError] = useState<string | null>(null);
  const m = useT();
  const templateCount = useWorkspaceStore((st) => st.workspace.catalog.length);
  const exportProject = (): void => {
    if (!location) return;
    const file = exportProjectFile(workspace, location.project.id, new Date().toISOString());
    if (!file.ok) {
      setExportError(file.error.message);
      return;
    }
    setExportError(null);
    downloadJson(`${slugify(location.project.name)}.glasshouse.json`, file.value);
  };
  return (
    <header className="title-block glass">
      <Link to="/" className="title-block__mark">
        <img src="/brand/glasshouse-lockup-horizontal-color.svg" width="148" height="40" alt="Glasshouse" />
      </Link>
      {location ? (
        <div className="title-block__where">
          {drawer ? <ProjectsButton drawer={drawer} /> : null}
          <RoomCrumbs location={location} isSample={location.project.isSample === true} />
          <p className="title-block__revision">
            <span className="mono">
              <span className="visually-hidden">{m.roomNav.revision} </span>
              {revision ? `R${pad2(revision.number)}` : '—'}
            </span>
            {revision ? <StatusStamp state={revision.state} /> : null}
          </p>
        </div>
      ) : (
        // Outside a room there is no breadcrumb: the title block shows the workspace instead.
        <dl className="title-block__cells">
          <Cell label={m.shell.workspace}>{m.shell.workspaceSummary(counts.projects, counts.rooms)}</Cell>
        </dl>
      )}
      <div className="title-block__actions">
        {location ? (
          <button type="button" className="btn btn--sm" onClick={exportProject} aria-label={m.shell.exportProject} title={m.shell.exportProject}>
            <IconDownload />
            <span className="title-block__export-label">{m.shell.exportProject}</span>
          </button>
        ) : null}
        {exportError ? (
          <span role="alert" className="save-status save-status--failed">
            {exportError}
          </span>
        ) : null}
        <SaveStatus save={save} />
        <LanguageSwitch />
        {/* The workspace's own tools sit at the far right; user settings join them here later. */}
        <span className="title-block__tools">
          <NavLink to="/catalog" className={({ isActive }) => `btn btn--sm title-block__catalog${isActive ? ' is-active' : ''}`} title={m.tree.catalog(templateCount)} aria-label={m.shell.catalog}>
            <IconCatalog />
            <span className="title-block__catalog-label">{m.shell.catalog}</span>
          </NavLink>
          {SERVER_MODE ? <UserMenu /> : null}
        </span>
      </div>
    </header>
  );
}
