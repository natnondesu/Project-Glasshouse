import { currentRevision, type RoomLocation } from '@glasshouse/domain';
import { ApprovalPanel } from './ApprovalPanel';
import { HistoryPanel } from './HistoryPanel';
import { NotesPanel } from './NotesPanel';
import { UnknownsPanel } from './UnknownsPanel';
import './review.css';

export function ReviewView({ location }: { location: RoomLocation }) {
  const { plan, id: roomId } = location.room;
  const revision = currentRevision(plan);
  return (
    <div className="review">
      <div className="review__col">
        <ApprovalPanel roomId={roomId} plan={plan} />
        <UnknownsPanel roomId={roomId} revision={revision} />
      </div>
      <div className="review__col">
        <NotesPanel roomId={roomId} plan={plan} frozen={revision.state === 'approved'} />
        <HistoryPanel plan={plan} roomId={roomId} />
      </div>
    </div>
  );
}
