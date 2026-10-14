import { Link } from 'react-router';
import { useT } from '../i18n';

export function NotFound({ message }: { message?: string }) {
  const m = useT();
  return (
    <section className="home glass">
      <h1>{m.shell.notFoundTitle}</h1>
      <p>{message ?? m.shell.notFound}</p>
      <p>
        <Link to="/">{m.shell.backToProjects}</Link>
      </p>
    </section>
  );
}
