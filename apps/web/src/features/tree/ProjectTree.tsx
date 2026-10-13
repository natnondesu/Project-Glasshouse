import { currentRevision, newId, type WorkspaceCommand } from '@glasshouse/domain';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { IconPlus } from '../../ui/icons';
import { pad2, STATE_LABEL } from '../../ui/StatusStamp';
import { TreeRow } from './TreeRow';
import './tree.css';

export function ProjectTree({ activeRoomId }: { activeRoomId: string | null }) {
  const projects = useWorkspaceStore((s) => s.workspace.projects);
  const templateCount = useWorkspaceStore((s) => s.workspace.catalog.length);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (command: WorkspaceCommand): boolean => {
    const problem = dispatch(command);
    setError(problem?.message ?? null);
    return problem === null;
  };
  const rename = (command: WorkspaceCommand): string | null => dispatch(command)?.message ?? null;
  const editing = (id: string) => ({
    editing: editingId === id,
    onStartEdit: () => setEditingId(id),
    onStopEdit: () => setEditingId(null),
  });

  const addProject = (): void => {
    const id = newId();
    if (run({ type: 'project/create', id, name: 'Untitled project' })) setEditingId(id);
  };

  return (
    <aside className="tree glass" aria-label="Projects">
      <div className="tree__head">
        <h2>Projects</h2>
        <button type="button" className="icon-btn" aria-label="New project" title="New project" onClick={addProject}>
          <IconPlus />
        </button>
      </div>
      {projects.length === 0 ? <p className="tree__empty">No projects yet.</p> : null}
      <ul className="tree__list">
        {projects.map((project) => (
          <TreeRow
            key={project.id}
            kind="project"
            label={project.name}
            {...editing(project.id)}
            onRename={(name) => rename({ type: 'project/rename', projectId: project.id, name })}
            onAdd={() => {
              const id = newId();
              if (run({ type: 'site/create', projectId: project.id, id, name: 'New site' })) setEditingId(id);
            }}
            addLabel={`Add site to ${project.name}`}
            onDelete={() => {
              const hadActive = project.sites.some((s) => s.rooms.some((r) => r.id === activeRoomId));
              if (run({ type: 'project/delete', projectId: project.id }) && hadActive) navigate('/');
            }}
            deleteWarning={`Delete ${project.name} and all its sites and rooms?`}
          >
            {project.sites.length > 0 ? (
              <ul className="tree__list">
                {project.sites.map((site) => (
                  <TreeRow
                    key={site.id}
                    kind="site"
                    label={site.name}
                    {...editing(site.id)}
                    onRename={(name) => rename({ type: 'site/rename', siteId: site.id, name })}
                    onAdd={() => {
                      const id = newId();
                      if (run({ type: 'room/create', siteId: site.id, id, name: 'New room' })) {
                        setEditingId(id);
                        navigate(`/rooms/${id}/plan`);
                      }
                    }}
                    addLabel={`Add room to ${site.name}`}
                    onDelete={() => {
                      const hadActive = site.rooms.some((r) => r.id === activeRoomId);
                      if (run({ type: 'site/delete', siteId: site.id }) && hadActive) navigate('/');
                    }}
                    deleteWarning={`Delete ${site.name} and its rooms?`}
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
                              badge={<span className="stamp">{`R${pad2(revision.number)} ${STATE_LABEL[revision.state]}`}</span>}
                              {...editing(room.id)}
                              onRename={(name) => rename({ type: 'room/rename', roomId: room.id, name })}
                              onDelete={() => {
                                if (run({ type: 'room/delete', roomId: room.id }) && room.id === activeRoomId) navigate('/');
                              }}
                              deleteWarning={`Delete ${room.name} and its plan?`}
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
      <Link to="/catalog" className="tree__catalog">
        Device catalog · {templateCount} {templateCount === 1 ? 'template' : 'templates'}
      </Link>
    </aside>
  );
}
