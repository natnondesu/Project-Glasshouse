import { archiveScope, archiveState, currentRevision, newId, parseProjectFile, type ArchiveKind, type ProjectFile, type WorkspaceCommand, missingSamples } from '@glasshouse/domain';
import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { confirmAction } from '../../ui/confirm/confirmStore';
import { readJsonFile } from '../../ui/files';
import { usePersistentState } from '../../ui/usePersistentState';
import { IconChevronLeft, IconPin, IconPlus, IconUpload } from '../../ui/icons';
import { ImportDialog } from '../handoff/ImportDialog';
import { pad2 } from '../../ui/StatusStamp';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { SERVER_MODE } from '../../sync/serverMode';
import { sampleCommands } from './sampleLoad';
import { BackupPanel } from './BackupPanel';
import { TreeRow } from './TreeRow';
import { useLocationStore } from '../globe/locationStore';
import './tree.css';

interface ProjectTreeProps {
  activeRoomId: string | null;
  /** Home's collapse-to-rail. */
  onCollapse?: () => void;
  /** Inside a room the tree is a drawer floating over the drawing, or docked once pinned. */
  variant?: 'docked' | 'drawer';
  pin?: { pinned: boolean; onToggle: () => void };
  onRoomPicked?: () => void;
  onRoomAdded?: (roomId: string) => void;
  onRenameDone?: (id: string) => void;
  panelRef?: Ref<HTMLElement>;
}

export const PROJECT_DRAWER_ID = 'project-drawer';

export function ProjectTree({ activeRoomId, onCollapse, variant = 'docked', pin, onRoomPicked, onRoomAdded, onRenameDone, panelRef }: ProjectTreeProps) {
  const projects = useWorkspaceStore((s) => s.workspace.projects);
  const workspace = useWorkspaceStore((s) => s.workspace);
  // Derived once per workspace change: a selector returning a new array each time would re-render forever.
  const missing = useMemo(() => missingSamples(workspace), [workspace]);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const m = useT();
  const can = useCan();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<ProjectFile | null>(null);
  const onImportFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readJsonFile(file);
    if (!read.ok) {
      setError(read.message);
      return;
    }
    const parsed = parseProjectFile(read.value);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    setError(null);
    setImporting(parsed.value);
  };

  const run = (command: WorkspaceCommand): boolean => {
    const problem = dispatch(command);
    setError(problem?.message ?? null);
    return problem === null;
  };
  const rename = (command: WorkspaceCommand): string | null => dispatch(command)?.message ?? null;
  const editLocation = useLocationStore((s) => s.edit);
  const [collapsed, setCollapsed] = usePersistentState<string[]>('glasshouse:tree-collapsed', []);
  // The open room's project and site always show, so the current room is never hidden.
  const activePath = new Set(
    projects.flatMap((p) => p.sites.flatMap((s) => (s.rooms.some((r) => r.id === activeRoomId) ? [p.id, s.id] : []))),
  );
  const isOpen = (id: string): boolean => activePath.has(id) || !collapsed.includes(id);
  const [showArchived, setShowArchived] = usePersistentState('glasshouse:tree-show-archived', false);
  const archivedItems = useMemo(
    () => projects.reduce((n, p) => n + (p.archivedAt === undefined ? 0 : 1) + p.sites.reduce((k, s) => k + (s.archivedAt === undefined ? 0 : 1) + s.rooms.filter((r) => r.archivedAt !== undefined).length, 0), 0),
    [projects],
  );
  // Archived items stay out of the way, except on the path to the room that is open: the tree never hides where you are.
  const shown = (archived: boolean, id: string): boolean => showArchived || !archived || activePath.has(id) || id === activeRoomId;
  const toggle = (id: string): void => setCollapsed(isOpen(id) ? [...collapsed, id] : collapsed.filter((c) => c !== id));

  const editing = (id: string) => ({
    editing: editingId === id,
    onStartEdit: () => setEditingId(id),
    onStopEdit: () => {
      setEditingId(null);
      onRenameDone?.(id);
    },
  });

  const loadSample = (): void => {
    const commands = sampleCommands(workspace, new Date().toISOString(), SERVER_MODE);
    if (!commands.ok) {
      setError(commands.error.message);
      return;
    }
    for (const command of commands.value) if (!run(command)) return;
  };

  const archivedBadge = (own: boolean): ReactNode => (own ? <span className="stamp stamp--archived">{m.archive.badge}</span> : undefined);

  const archiveActions = (kind: ArchiveKind, id: string, name: string) => {
    if (!can.admin) return undefined;
    const state = archiveState(workspace, kind, id);
    const restoreFirst = state.source && state.by !== 'self' ? m.archive.restoreFirst(m.tree.kind[state.source.kind], state.source.name) : null;
    return {
      restoreFirst,
      onArchive: () => {
        const scope = archiveScope(workspace, kind, id);
        void confirmAction({
          title: m.archive.confirmTitle(name, scope.sites, scope.rooms),
          body: m.archive.confirmBody(scope.sites + scope.rooms > 0),
          confirmLabel: m.archive.archive,
          tone: 'primary',
        }).then((ok) => {
          if (!ok) return;
          const stamp = { by: can.me?.name ?? '', at: new Date().toISOString() };
          run(kind === 'project' ? { type: 'project/archive', projectId: id, ...stamp } : kind === 'site' ? { type: 'site/archive', siteId: id, ...stamp } : { type: 'room/archive', roomId: id, ...stamp });
        });
      },
      onRestore: () => {
        if (restoreFirst) return setError(restoreFirst);
        run(kind === 'project' ? { type: 'project/restore', projectId: id } : kind === 'site' ? { type: 'site/restore', siteId: id } : { type: 'room/restore', roomId: id });
      },
    };
  };

  /** Why this archived item can't be deleted yet (null while it is live). */
  const deleteBlocked = (kind: ArchiveKind, id: string, name: string) => {
    const state = archiveState(workspace, kind, id);
    if (!state.source) return undefined;
    const reason = m.archive.refused('delete', m.tree.kind[kind], name, state.by === 'self', m.tree.kind[state.source.kind], state.source.name);
    return { reason, onExplain: () => setError(reason) };
  };

  const addProject = (): void => {
    const id = newId();
    if (run({ type: 'project/create', id, name: m.tree.untitledProject })) setEditingId(id);
  };

  return (
    <aside ref={panelRef} id={variant === 'drawer' ? PROJECT_DRAWER_ID : undefined} className={`tree glass${variant === 'drawer' ? ' tree--drawer' : ''}`} aria-label={m.tree.title}>
      <div className="tree__head">
        <h2>{m.tree.title}</h2>
        <span className="tree__head-actions">
          {can.edit ? (
            <>
              <button type="button" className="icon-btn" aria-label={m.tree.importFile} title={m.tree.importFile} onClick={() => fileInput.current?.click()}>
                <IconUpload />
              </button>
              <button type="button" className="icon-btn" aria-label={m.tree.newProject} title={m.tree.newProject} onClick={addProject}>
                <IconPlus />
              </button>
            </>
          ) : null}
          {pin ? (
            <button
              type="button"
              className={`icon-btn tree__pin${pin.pinned ? ' is-pinned' : ''}`}
              aria-label={m.roomNav.pin}
              aria-pressed={pin.pinned}
              data-hint={m.roomNav.pinHint(pin.pinned)}
              onClick={pin.onToggle}
            >
              <IconPin />
            </button>
          ) : null}
          {onCollapse ? (
            <button type="button" className="icon-btn" aria-label={m.tree.hide} aria-expanded title={m.tree.hide} onClick={onCollapse}>
              <IconChevronLeft />
            </button>
          ) : null}
        </span>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={m.tree.chooseFile}
          onChange={(e) => {
            void onImportFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {/* Only the tree scrolls: the header with its actions, and backup below, stay put. */}
      <div className="tree__scroll">
      {projects.length === 0 ? <p className="tree__empty">{m.tree.empty}</p> : null}
      <ul className="tree__list">
        {projects.filter((project) => shown(project.archivedAt !== undefined, project.id)).map((project) => (
          <TreeRow
            key={project.id}
            kind="project"
            label={project.name}
            expanded={isOpen(project.id)}
            onToggle={() => toggle(project.id)}
            badge={
              <>
                {project.isSample ? <span className="stamp stamp--sample">{m.common.sample}</span> : null}
                {archivedBadge(project.archivedAt !== undefined)}
              </>
            }
            {...editing(project.id)}
            canEdit={can.edit}
            canDelete={can.admin}
            archived={project.archivedAt !== undefined}
            archiveActions={archiveActions('project', project.id, project.name)}
            deleteBlocked={deleteBlocked('project', project.id, project.name)}
            onRename={(name) => rename({ type: 'project/rename', projectId: project.id, name })}
            onAdd={can.edit && project.archivedAt === undefined ? () => {
              const id = newId();
              if (run({ type: 'site/create', projectId: project.id, id, name: m.tree.newSite })) setEditingId(id);
            } : undefined}
            addLabel={m.tree.addSite(project.name)}
            onDelete={() => {
              const hadActive = project.sites.some((s) => s.rooms.some((r) => r.id === activeRoomId));
              if (run({ type: 'project/delete', projectId: project.id }) && hadActive) navigate('/');
            }}
            deleteWarning={m.tree.deleteProject(project.name)}
          >
            {project.sites.length > 0 ? (
              <ul className="tree__list">
                {project.sites.filter((site) => shown(project.archivedAt !== undefined || site.archivedAt !== undefined, site.id)).map((site) => (
                  <TreeRow
                    key={site.id}
                    kind="site"
                    label={site.name}
                    expanded={isOpen(site.id)}
                    onToggle={() => toggle(site.id)}
                    badge={archivedBadge(site.archivedAt !== undefined)}
                    {...editing(site.id)}
                    canEdit={can.edit}
                    archived={project.archivedAt !== undefined || site.archivedAt !== undefined}
                    archiveActions={archiveActions('site', site.id, site.name)}
                    deleteBlocked={deleteBlocked('site', site.id, site.name)}
                    onRename={(name) => rename({ type: 'site/rename', siteId: site.id, name })}
                    onLocate={() => editLocation(site.id)}
                    onAdd={can.edit && project.archivedAt === undefined && site.archivedAt === undefined ? () => {
                      const id = newId();
                      if (run({ type: 'room/create', siteId: site.id, id, floorAreaId: newId(), name: m.tree.newRoom })) {
                        setEditingId(id);
                        onRoomAdded?.(id);
                        navigate(`/rooms/${id}/plan`);
                      }
                    } : undefined}
                    addLabel={m.tree.addRoom(site.name)}
                    onDelete={() => {
                      const hadActive = site.rooms.some((r) => r.id === activeRoomId);
                      if (run({ type: 'site/delete', siteId: site.id }) && hadActive) navigate('/');
                    }}
                    deleteWarning={m.tree.deleteSite(site.name)}
                  >
                    {site.rooms.length > 0 ? (
                      <ul className="tree__list">
                        {site.rooms.filter((room) => shown(project.archivedAt !== undefined || site.archivedAt !== undefined || room.archivedAt !== undefined, room.id)).map((room) => {
                          const revision = currentRevision(room.plan);
                          return (
                            <TreeRow
                              key={room.id}
                              kind="room"
                              label={room.name}
                              to={`/rooms/${room.id}/plan`}
                              onOpen={onRoomPicked}
                              active={room.id === activeRoomId}
                              badge={
                                room.archivedAt !== undefined ? (
                                  archivedBadge(true)
                                ) : (
                                  <span className={`stamp stamp--${revision.state}`}>{`R${pad2(revision.number)} ${m.revision.stamp[revision.state]}`}</span>
                                )
                              }
                              {...editing(room.id)}
                              canEdit={can.edit}
                              archived={project.archivedAt !== undefined || site.archivedAt !== undefined || room.archivedAt !== undefined}
                              archiveActions={archiveActions('room', room.id, room.name)}
                              deleteBlocked={deleteBlocked('room', room.id, room.name)}
                              onRename={(name) => rename({ type: 'room/rename', roomId: room.id, name })}
                              onDelete={() => {
                                if (run({ type: 'room/delete', roomId: room.id }) && room.id === activeRoomId) navigate('/');
                              }}
                              deleteWarning={m.tree.deleteRoom(room.name)}
                            />
                          );
                        })}
                      </ul>
                    ) : null}
                  </TreeRow>
                ))}
              </ul>
            ) : null}
          </TreeRow>
        ))}
      </ul>
      {archivedItems > 0 || showArchived ? (
        <label className="tree__archived-toggle">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>{m.archive.show}</span>
          <span className="tree__archived-count mono">{archivedItems}</span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="tree__error">
          {error}
        </p>
      ) : null}
      {missing.length === 0 || !can.edit ? null : (
        <button type="button" className="btn btn--sm btn--quiet tree__sample" onClick={loadSample}>
          {missing.length === 1 ? m.tree.loadOneSample(missing[0]!) : m.tree.loadSample}
        </button>
      )}
      </div>
      {importing ? <ImportDialog file={importing} onClose={() => setImporting(null)} /> : null}
      {SERVER_MODE ? null : <BackupPanel />}
    </aside>
  );
}
