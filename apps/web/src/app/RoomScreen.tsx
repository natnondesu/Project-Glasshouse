import { useParams } from 'react-router';
import { useRoomLocation } from '../store/hooks';
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
        <section className="room-screen__body" aria-label="Room plan" />
      ) : (
        <NotFound message="That view doesn't exist for this room." />
      )}
    </div>
  );
}
