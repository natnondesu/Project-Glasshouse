import { currentRevision } from '@glasshouse/domain';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { BomView } from '../features/bom/BomView';
import { NetworkView } from '../features/network/NetworkView';
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
import { useT } from '../i18n';

/** View route segment to its tab label key, for the page heading. */
const TAB_LABEL: Record<string, 'plan' | 'elevation' | 'threeD' | 'network' | 'bom' | 'review'> = { plan: 'plan', elevation: 'elevation', '3d': 'threeD', network: 'network', bom: 'bom', review: 'review' };

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const realLocation = useRoomLocation(roomId);
  const viewedNumber = useViewedRevisionNumber();
  const m = useT();
  if (!realLocation) return <NotFound message={m.shell.roomMissing} />;
  const past = view === 'review' ? null : locationAtRevision(realLocation, viewedNumber);
  const location = past ?? realLocation;
  const revision = currentRevision(location.room.plan);
  const readOnly = past !== null || revision.state !== 'draft';
  let body;
  if (view === 'plan') body = <PlanView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />;
  else if (view === 'elevation') body = <ElevationView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} viewingPast={past !== null} />;
  else if (view === '3d')
    body = (
      <Suspense fallback={<p className="room3d__fallback" role="status">{m.shell.loading3d}</p>}>
        <Room3DView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />
      </Suspense>
    );
  else if (view === 'network') body = <NetworkView key={`${roomId}:${revision.number}`} location={location} readOnly={readOnly} />;
  else if (view === 'bom') body = <BomView key={roomId} location={location} />;
  else if (view === 'review') body = <ReviewView key={roomId} location={location} />;
  else return <NotFound message={m.shell.viewMissing} />;
  return (
    <div className="room-screen">
      <h1 className="visually-hidden">{m.views.pageTitle(realLocation.room.name, TAB_LABEL[view] ? m.views[TAB_LABEL[view]!] : view)}</h1>
      <ViewTabs roomId={roomId} />
      {past ? <RevisionBanner roomId={roomId} view={view} viewed={revision} current={currentRevision(realLocation.room.plan)} /> : null}
      {!past && readOnly && (view === 'plan' || view === 'elevation' || view === 'network') ? <FrozenBanner roomId={roomId} revision={revision} /> : null}
      <ErrorBoundary key={view} label={m.views.drawing[view] ?? m.views.drawing.other!}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
