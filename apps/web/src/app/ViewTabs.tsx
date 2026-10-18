import { approvalBlockers, currentRevision, latestApproved, type Revision } from '@glasshouse/domain';
import { FrozenChip } from './FrozenChip';
import { RoomClaimBanner } from '../claims/RoomClaimBanner';
import { Link, NavLink } from 'react-router';
import { pad2 } from '../ui/StatusStamp';
import { useT } from '../i18n';
import { useRoomArchived, useRoomLocation, useViewedRevisionNumber } from '../store/hooks';

const VIEWS = [
  { id: 'plan', key: 'plan' },
  { id: 'elevation', key: 'elevation' },
  { id: '3d', key: 'threeD' },
  { id: 'network', key: 'network' },
  { id: 'bom', key: 'bom' },
  { id: 'review', key: 'review' },
] as const;

/**
 * `frozen`: the revision on screen when it can't be edited; the bar says so once, with Start new draft.
 * `claim`: the draft is live, so the bar shows who is editing it (a chip, not a strip: the drawing keeps its height).
 */
export function ViewTabs({ roomId, frozen = null, claim = false }: { roomId: string; frozen?: Revision | null; claim?: boolean }) {
  const location = useRoomLocation(roomId);
  const m = useT();
  const rev = useViewedRevisionNumber();
  const archived = useRoomArchived(roomId);
  const plan = location?.room.plan;
  const approved = plan ? latestApproved(plan) : null;
  // Nothing can be fixed in an archived room, so the count would only nag.
  const blockers = plan && !archived && currentRevision(plan).state !== 'approved' ? approvalBlockers(plan).length : 0;
  return (
    <nav className="view-tabs glass" aria-label={m.views.nav}>
      <span className="view-tabs__seg">
        {VIEWS.map((v) => (
          <NavLink key={v.id} to={`/rooms/${roomId}/${v.id}${rev !== null && v.id !== 'review' ? `?rev=${rev}` : ''}`} className={({ isActive }) => `view-tab${isActive ? ' is-active' : ''}`}>
            {m.views[v.key]}
            {v.id === 'review' && blockers > 0 ? (
              <>
                <span className="view-tab__badge mono" aria-hidden="true">
                  {blockers}
                </span>
                <span className="visually-hidden">{m.views.blockersSr(blockers)}</span>
              </>
            ) : null}
          </NavLink>
        ))}
      </span>
      <span className="view-tabs__meta">
        {frozen ? <FrozenChip roomId={roomId} revision={frozen} /> : null}
        {claim ? <RoomClaimBanner roomId={roomId} /> : null}
        {approved ? (
          <Link to={`/rooms/${roomId}/install-sheet`} className="btn btn--sm">
            {m.views.installSheet(pad2(approved.number))}
          </Link>
        ) : (
          <span className="view-tabs__hint" title={m.views.installAfterHint}>
            {m.views.installAfter}
          </span>
        )}
      </span>
    </nav>
  );
}
