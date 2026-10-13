import { Link, Outlet } from 'react-router';
import { GlasshouseMark } from '../ui/icons';
import './shell.css';

export function Shell() {
  return (
    <div className="shell">
      <header className="title-block">
        <Link to="/" className="title-block__mark">
          <GlasshouseMark />
          <span>Glasshouse</span>
        </Link>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
