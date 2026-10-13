import { useParams } from 'react-router';
import { PlanView } from '../features/plan/PlanView';
import { useRoomLocation } from '../store/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      {view === 'plan' ? (
        <ErrorBoundary label="the plan">
          <PlanView key={roomId} location={location} />
        </ErrorBoundary>
      ) : (
        <NotFound message="That view doesn't exist for this room." />
      )}
    </div>
  );
}
