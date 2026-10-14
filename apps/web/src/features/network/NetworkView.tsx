import { currentRevision, type RoomLocation } from '@glasshouse/domain';
import { usePlanCommit } from '../../store/hooks';
import { VlanList } from './VlanList';
import './network.css';

export function NetworkView({ location, readOnly }: { location: RoomLocation; readOnly: boolean }) {
  const content = currentRevision(location.room.plan).content;
  const commit = usePlanCommit(location.room.id);
  return (
    <div className="network">
      <VlanList content={content} commit={commit} readOnly={readOnly} />
    </div>
  );
}
