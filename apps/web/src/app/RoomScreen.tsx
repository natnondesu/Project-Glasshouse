import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { useRoomLocation } from '../store/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  let body;
  if (view === 'plan') body = <PlanView key={roomId} location={location} />;
  else if (view === 'elevation') body = <ElevationView key={roomId} location={location} />;
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else return <NotFound message="That view doesn't exist for this room." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      <ErrorBoundary key={view} label={view === 'plan' ? 'the plan' : view === 'elevation' ? 'the elevation' : 'the BOM'}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
