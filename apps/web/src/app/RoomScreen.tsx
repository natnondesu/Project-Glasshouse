import { currentRevision } from '@glasshouse/domain';
import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { ReviewView } from '../features/review/ReviewView';
import { useRoomLocation } from '../store/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { FrozenBanner } from './FrozenBanner';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

const LABEL: Record<string, string> = { plan: 'the plan', elevation: 'the elevation', bom: 'the BOM', review: 'the review' };

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  const revision = currentRevision(location.room.plan);
  const readOnly = revision.state !== 'draft';
  let body;
  if (view === 'plan') body = <PlanView key={roomId} location={location} readOnly={readOnly} />;
  else if (view === 'elevation') body = <ElevationView key={roomId} location={location} readOnly={readOnly} />;
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else if (view === 'review') body = <ReviewView key={roomId} location={location} />;
  else return <NotFound message="That view doesn't exist for this room." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      {readOnly && (view === 'plan' || view === 'elevation') ? <FrozenBanner roomId={roomId} revision={revision} /> : null}
      <ErrorBoundary key={view} label={LABEL[view] ?? 'this view'}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
