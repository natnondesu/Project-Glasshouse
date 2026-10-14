import type { Revision } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { useReviewCommit } from '../store/hooks';
import { pad2 } from '../ui/StatusStamp';

export function FrozenBanner({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const [error, setError] = useState<string | null>(null);
  const m = useT();
  return (
    <div className="frozen-banner glass" role="status">
      <span>
        <strong>{m.revision.frozen(pad2(revision.number), m.revision.state[revision.state])}</strong>
        {m.revision.frozenTail}
      </span>
      <Link to={`/rooms/${roomId}/review`} className="btn btn--sm btn--quiet">
        {m.revision.openReview}
      </Link>
      <button type="button" className="btn btn--sm btn--ink" onClick={() => setError(review({ type: 'review/new-draft', at: new Date().toISOString() }))}>
        {m.revision.startDraft}
      </button>
      {error ? (
        <span role="alert" className="field__error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
