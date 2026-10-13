import { approvalBlockers, currentRevision, latestApproved } from '@glasshouse/domain';
import { Link, NavLink } from 'react-router';
import { pad2 } from '../ui/StatusStamp';
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
  const approved = plan ? latestApproved(plan) : null;
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
      <span className="view-tabs__meta">
        {approved ? (
          <Link to={`/rooms/${roomId}/install-sheet`} className="btn btn--sm">
            {`Install sheet · R${pad2(approved.number)}`}
          </Link>
        ) : (
          <span className="view-tabs__hint" title="The Install sheet prints from an Approved revision.">
            Install sheet after approval
          </span>
        )}
      </span>
    </nav>
  );
}
