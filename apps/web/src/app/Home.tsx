import { useWorkspaceStore } from '../store/workspaceStore';

export function Home() {
  const hasProjects = useWorkspaceStore((s) => s.workspace.projects.length > 0);
  return (
    <section className="home glass">
      <h1>{hasProjects ? 'Open a room to plan it' : 'Start with a project'}</h1>
      <p>
        {hasProjects
          ? 'Pick a room in the project tree, or add one to a site.'
          : 'Create a project in the tree, add a site, then add the room you are surveying.'}
      </p>
    </section>
  );
}
