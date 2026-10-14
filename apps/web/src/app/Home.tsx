import { useT } from '../i18n';
import { useWorkspaceStore } from '../store/workspaceStore';

export function Home() {
  const hasProjects = useWorkspaceStore((s) => s.workspace.projects.length > 0);
  const m = useT();
  return (
    <section className="home glass">
      <h1>{m.shell.homeTitle(hasProjects)}</h1>
      <p>{m.shell.homeBody(hasProjects)}</p>
    </section>
  );
}
