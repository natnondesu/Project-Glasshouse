import { currentRevision } from '@glasshouse/domain';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { ReviewView } from '../features/review/ReviewView';
import { locationAtRevision, useRoomLocation, useViewedRevisionNumber } from '../store/hooks';
import { RevisionBanner } from './RevisionBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { FrozenBanner } from './FrozenBanner';
import { NotFound } from './NotFound';

// three.js is large and only this view needs it: keep it out of the main bundle.
const Room3DView = lazy(() => import('../features/room3d/Room3DView'));
import { ViewTabs } from './ViewTabs';

const LABEL: Record<string, string> = { plan: 'the plan', elevation: 'the elevation', '3d': 'the 3D view', bom: 'the BOM', review: 'the review' };

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const realLocation = useRoomLocation(roomId);
  const viewedNumber = useViewedRevisionNumber();
  if (!realLocation) return <NotFound message="This room isn't in this browser's workspace." />;
  const past = view === 'review' ? null : locationAtRevision(realLocation, viewedNumber);
  const location = past ?? realLocation;
  const revision = currentRevision(location.room.plan);
  const readOnly = past !== null || revision.state !== 'draft';
  let body;
  if (view === 'plan') body = <PlanView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />;
  else if (view === 'elevation') body = <ElevationView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} viewingPast={past !== null} />;
  else if (view === '3d')
    body = (
      <Suspense fallback={<p className="room3d__fallback" role="status">Loading 3D…</p>}>
        <Room3DView key={roomId} location={location} />
      </Suspense>
    );
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else if (view === 'review') body = <ReviewView key={roomId} location={location} />;
  else return <NotFound message="That view doesn't exist for this room." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      {past ? <RevisionBanner roomId={roomId} view={view} viewed={revision} current={currentRevision(realLocation.room.plan)} /> : null}
      {!past && readOnly && (view === 'plan' || view === 'elevation') ? <FrozenBanner roomId={roomId} revision={revision} /> : null}
      <ErrorBoundary key={view} label={LABEL[view] ?? 'this view'}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
