import { approvalBlockers, currentRevision } from '@glasshouse/domain';
import { NavLink } from 'react-router';
import { useRoomLocation } from '../store/hooks';

const VIEWS = [
  { id: 'plan', label: 'Plan' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'bom', label: 'Devices & BOM' },
  { id: 'review', label: 'Review' },
] as const;

export function ViewTabs({ roomId }: { roomId: string }) {
  const location = useRoomLocation(roomId);
  const plan = location?.room.plan;
  const blockers = plan && currentRevision(plan).state !== 'approved' ? approvalBlockers(plan).length : 0;
  return (
    <nav className="view-tabs glass" aria-label="Room views">
      <span className="view-tabs__seg">
        {VIEWS.map((v) => (
          <NavLink key={v.id} to={`/rooms/${roomId}/${v.id}`} className={({ isActive }) => `view-tab${isActive ? ' is-active' : ''}`}>
            {v.label}
            {v.id === 'review' && blockers > 0 ? (
              <span className="view-tab__badge mono" aria-hidden="true">
                {blockers}
              </span>
            ) : null}
          </NavLink>
        ))}
      </span>
      <span className="view-tabs__meta">Grid 0.50 m · snap 0.10 m</span>
    </nav>
  );
}
