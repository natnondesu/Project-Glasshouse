import type { Revision } from '@glasshouse/domain';
import { Link } from 'react-router';
import { pad2, STATE_LABEL } from '../ui/StatusStamp';

const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

/** Shown while an older Revision is on screen: everything is read-only until you go back. */
export function RevisionBanner({ roomId, view, viewed, current }: { roomId: string; view: string; viewed: Revision; current: Revision }) {
  return (
    <div className="frozen-banner frozen-banner--history glass" role="status">
      <span>
        <strong>{`Viewing R${pad2(viewed.number)} (${titleCase(STATE_LABEL[viewed.state])})`}</strong>, an older revision. Read-only.
      </span>
      <Link to={`/rooms/${roomId}/${view}`} className="btn btn--sm btn--ink">
        {`Back to current (R${pad2(current.number)})`}
      </Link>
    </div>
  );
}
