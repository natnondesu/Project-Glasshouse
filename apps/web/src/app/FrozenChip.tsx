import type { Revision } from '@glasshouse/domain';
import { useState } from 'react';
import { useT } from '../i18n';
import { useReviewCommit } from '../store/hooks';
import { IconLock } from '../ui/icons';
import { pad2 } from '../ui/StatusStamp';

/**
 * A frozen revision, said once in the tab bar rather than as a banner over every view: a chip with
 * the state and the way out ("Start new draft"). The full sentence is there for screen readers.
 */
export function FrozenChip({ roomId, revision }: { roomId: string; revision: Revision }) {
  const review = useReviewCommit(roomId);
  const [error, setError] = useState<string | null>(null);
  const m = useT();
  const sentence = `${m.revision.frozen(pad2(revision.number), m.revision.state[revision.state])}${m.revision.frozenTail}`;
  return (
    <span className="frozen-chip" role="status">
      <span className={`frozen-chip__state${revision.state === 'approved' ? ' is-approved' : ''}`} title={sentence}>
        <IconLock aria-hidden="true" />
        <span aria-hidden="true">{m.revision.chip(pad2(revision.number), m.revision.state[revision.state])}</span>
        <span className="visually-hidden">{sentence}</span>
      </span>
      <button type="button" className="btn btn--sm btn--ink" onClick={() => setError(review({ type: 'review/new-draft', at: new Date().toISOString() }))}>
        {m.revision.startDraft}
      </button>
      {error ? (
        <span role="alert" className="field__error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
