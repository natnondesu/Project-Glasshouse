import type { Revision } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { useReviewCommit } from '../store/hooks';
import { pad2 } from '../ui/StatusStamp';

export function FrozenBanner({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="frozen-banner glass" role="status">
      <span>
        <strong>{`Revision ${pad2(revision.number)} is ${revision.state === 'approved' ? 'Approved' : 'In review'}`}</strong> and frozen, so this view is read-only.
      </span>
      <Link to={`/rooms/${roomId}/review`} className="btn btn--sm btn--quiet">
        Open review
      </Link>
      <button type="button" className="btn btn--sm btn--ink" onClick={() => setError(review({ type: 'review/new-draft', at: new Date().toISOString() }))}>
        Start new draft
      </button>
      {error ? (
        <span role="alert" className="field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
