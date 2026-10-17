import { currentRevision, newId, parseProjectFile, type ProjectFile, type WorkspaceCommand, missingSamples } from '@glasshouse/domain';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { readJsonFile } from '../../ui/files';
import { usePersistentState } from '../../ui/usePersistentState';
import { IconChevronLeft, IconPlus, IconUpload } from '../../ui/icons';
import { ImportDialog } from '../handoff/ImportDialog';
import { pad2 } from '../../ui/StatusStamp';
import { useT } from '../../i18n';
import { SERVER_MODE } from '../../sync/serverMode';
import { sampleCommands } from './sampleLoad';
import { BackupPanel } from './BackupPanel';
import { TreeRow } from './TreeRow';
import './tree.css';

export function ProjectTree({ activeRoomId, onCollapse }: { activeRoomId: string | null; onCollapse?: () => void }) {
  const projects = useWorkspaceStore((s) => s.workspace.projects);
  const workspace = useWorkspaceStore((s) => s.workspace);
  // Derived once per workspace change: a selector returning a new array each time would re-render forever.
  const missing = useMemo(() => missingSamples(workspace), [workspace]);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const m = useT();
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
  const [collapsed, setCollapsed] = usePersistentState<string[]>('glasshouse:tree-collapsed', []);
  // The open room's project and site always show, so the current room is never hidden.
  const activePath = new Set(
    projects.flatMap((p) => p.sites.flatMap((s) => (s.rooms.some((r) => r.id === activeRoomId) ? [p.id, s.id] : []))),
  );
  const isOpen = (id: string): boolean => activePath.has(id) || !collapsed.includes(id);
  const toggle = (id: string): void => setCollapsed(isOpen(id) ? [...collapsed, id] : collapsed.filter((c) => c !== id));

  const editing = (id: string) => ({
    editing: editingId === id,
    onStartEdit: () => setEditingId(id),
    onStopEdit: () => setEditingId(null),
  });

  const loadSample = (): void => {
    const commands = sampleCommands(workspace, new Date().toISOString(), SERVER_MODE);
    if (!commands.ok) {
      setError(commands.error.message);
      return;
    }
    for (const command of commands.value) if (!run(command)) return;
  };

  const addProject = (): void => {
    const id = newId();
    if (run({ type: 'project/create', id, name: m.tree.untitledProject })) setEditingId(id);
  };

  return (
    <aside className="tree glass" aria-label={m.tree.title}>
      <div className="tree__head">
        <h2>{m.tree.title}</h2>
        <span className="tree__head-actions">
          <button type="button" className="icon-btn" aria-label={m.tree.importFile} title={m.tree.importFile} onClick={() => fileInput.current?.click()}>
            <IconUpload />
          </button>
          <button type="button" className="icon-btn" aria-label={m.tree.newProject} title={m.tree.newProject} onClick={addProject}>
            <IconPlus />
          </button>
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
        {projects.map((project) => (
          <TreeRow
            key={project.id}
            kind="project"
            label={project.name}
            expanded={isOpen(project.id)}
            onToggle={() => toggle(project.id)}
            badge={project.isSample ? <span className="stamp stamp--sample">{m.common.sample}</span> : undefined}
            {...editing(project.id)}
            onRename={(name) => rename({ type: 'project/rename', projectId: project.id, name })}
            onAdd={() => {
              const id = newId();
              if (run({ type: 'site/create', projectId: project.id, id, name: m.tree.newSite })) setEditingId(id);
            }}
            addLabel={m.tree.addSite(project.name)}
            onDelete={() => {
              const hadActive = project.sites.some((s) => s.rooms.some((r) => r.id === activeRoomId));
              if (run({ type: 'project/delete', projectId: project.id }) && hadActive) navigate('/');
            }}
            deleteWarning={m.tree.deleteProject(project.name)}
          >
            {project.sites.length > 0 ? (
              <ul className="tree__list">
                {project.sites.map((site) => (
                  <TreeRow
                    key={site.id}
                    kind="site"
                    label={site.name}
                    expanded={isOpen(site.id)}
                    onToggle={() => toggle(site.id)}
                    {...editing(site.id)}
                    onRename={(name) => rename({ type: 'site/rename', siteId: site.id, name })}
                    onAdd={() => {
                      const id = newId();
                      if (run({ type: 'room/create', siteId: site.id, id, floorAreaId: newId(), name: m.tree.newRoom })) {
                        setEditingId(id);
                        navigate(`/rooms/${id}/plan`);
                      }
                    }}
                    addLabel={m.tree.addRoom(site.name)}
                    onDelete={() => {
                      const hadActive = site.rooms.some((r) => r.id === activeRoomId);
                      if (run({ type: 'site/delete', siteId: site.id }) && hadActive) navigate('/');
                    }}
                    deleteWarning={m.tree.deleteSite(site.name)}
                  >
                    {site.rooms.length > 0 ? (
                      <ul className="tree__list">
                        {site.rooms.map((room) => {
                          const revision = currentRevision(room.plan);
                          return (
                            <TreeRow
                              key={room.id}
                              kind="room"
                              label={room.name}
                              to={`/rooms/${room.id}/plan`}
                              active={room.id === activeRoomId}
                              badge={<span className={`stamp stamp--${revision.state}`}>{`R${pad2(revision.number)} ${m.revision.stamp[revision.state]}`}</span>}
                              {...editing(room.id)}
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
      {error ? (
        <p role="alert" className="tree__error">
          {error}
        </p>
      ) : null}
      {missing.length === 0 ? null : (
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
