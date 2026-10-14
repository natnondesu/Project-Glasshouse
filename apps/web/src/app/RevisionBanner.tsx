import type { Revision } from '@glasshouse/domain';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { pad2 } from '../ui/StatusStamp';

/** Shown while an older Revision is on screen: everything is read-only until you go back. */
export function RevisionBanner({ roomId, view, viewed, current }: { roomId: string; view: string; viewed: Revision; current: Revision }) {
  const m = useT();
  return (
    <div className="frozen-banner frozen-banner--history glass" role="status">
      <span>
        <strong>{m.revision.viewing(pad2(viewed.number), m.revision.state[viewed.state])}</strong>
        {m.revision.olderReadOnly}
      </span>
      <Link to={`/rooms/${roomId}/${view}`} className="btn btn--sm btn--ink">
        {m.revision.backToCurrent(pad2(current.number))}
      </Link>
    </div>
  );
}
