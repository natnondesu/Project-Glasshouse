import { NavLink } from 'react-router';

const VIEWS = [{ id: 'plan', label: 'Plan' }] as const;

export function ViewTabs({ roomId }: { roomId: string }) {
  return (
    <nav className="view-tabs" aria-label="Room views">
      {VIEWS.map((v) => (
        <NavLink key={v.id} to={`/rooms/${roomId}/${v.id}`} className={({ isActive }) => `view-tab${isActive ? ' is-active' : ''}`}>
          {v.label}
        </NavLink>
      ))}
      <span className="view-tabs__meta">Grid 0.50 m · snap 0.10 m</span>
    </nav>
  );
}
