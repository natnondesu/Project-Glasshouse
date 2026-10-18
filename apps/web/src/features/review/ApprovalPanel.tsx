import { approvalBlockerItems, currentRevision, isSelfApproved, shortFingerprint, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useCan } from '../../auth/useCan';
import { useT } from '../../i18n';
import { useReviewCommit, useRoomArchived } from '../../store/hooks';
import { usePeople } from '../../people/peopleStore';
import { personLabel } from '../../ui/person';
import { pad2, StatusStamp } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { blockerText } from '../plan/issueText';

const now = (): string => new Date().toISOString();
const sameName = (a: string, b: string): boolean => a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

export function ApprovalPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const revision = currentRevision(plan);
  const review = useReviewCommit(roomId);
  const blockers = approvalBlockerItems(plan);
  const m = useT();
  const people = usePeople();
  // An archived room is read-only: nobody submits, approves or starts a draft until it is restored.
  const archived = useRoomArchived(roomId);
  const realCan = useCan();
  const can = { ...realCan, edit: realCan.edit && !archived, review: realCan.review && !archived };
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Submit and Approve freeze the plan for good, so each asks once, in place, with what it will do.
  const [confirming, setConfirming] = useState(false);
  const rev = pad2(revision.number);
  // On the shared server the name and id are the signed-in user's, so the screen is right at once; the server stamps them again regardless.
  const who = can.me?.name ?? name;
  const byId = can.me ? { byId: can.me.id } : {};
  const ownSubmission = !!can.me && !!revision.designedBy?.userId && revision.designedBy.userId === can.me.id;

  const act = (problem: string | null): void => {
    setError(problem);
    setConfirming(false);
    if (problem === null) setName('');
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    act(review({ type: 'review/submit', designedBy: who, ...byId, at: now() }));
  };
  const approve = (e: FormEvent): void => {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    act(review({ type: 'review/approve', reviewer: who, ...byId, at: now() }));
  };
  const newDraft = (): void => act(review({ type: 'review/new-draft', at: now() }));
  const cancel = (
    <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
      {m.common.cancel}
    </button>
  );

  if (revision.state === 'approved') {
    return (
      <section className="review-card glass" aria-labelledby="approval-h">
        <h2 id="approval-h" className="visually-hidden">
          {m.review.revision(rev)}
        </h2>
        <div className="approval-stamp" role="status">
          <span className="approval-stamp__word">{m.review.stamp}</span>
          <span className="approval-stamp__rev mono">{m.review.stampRev(rev)}</span>
          <span className="approval-stamp__when mono">{formatTime(revision.approvedAt)}</span>
          {revision.approvedBy ? <span className="approval-stamp__by">{m.review.stampBy(personLabel(m, revision.approvedBy, people))}</span> : null}
          {revision.approvedHash ? <span className="approval-stamp__hash mono">{m.review.fingerprint(shortFingerprint(revision.approvedHash))}</span> : null}
          {isSelfApproved(revision) ? <span className="stamp stamp--warn">{m.review.selfApproved}</span> : null}
        </div>
        <dl className="review-facts">
          <dt>{m.review.designedBy}</dt>
          <dd>{revision.designedBy ? personLabel(m, revision.designedBy, people) : '—'}</dd>
          <dt>{m.review.submitted}</dt>
          <dd>{formatTime(revision.submittedAt)}</dd>
        </dl>
        <p className="review-note">{archived ? m.archive.reviewNote : m.review.approvedNote}</p>
        <div className="review-form__actions">
          <Link to={`/rooms/${roomId}/install-sheet`} className="btn btn--ink">
            {m.review.openSheet}
          </Link>
          {can.edit ? (
            <button type="button" className="btn" onClick={newDraft}>
              {m.review.startDraft}
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="review-card glass" aria-labelledby="approval-h">
      <header className="review-card__head">
        <h2 id="approval-h">{m.review.revision(rev)}</h2>
        <StatusStamp state={revision.state} />
      </header>
      <dl className="review-facts">
        <dt>{m.review.designedBy}</dt>
        <dd>{revision.designedBy ? personLabel(m, revision.designedBy, people) : '—'}</dd>
        <dt>{m.review.submitted}</dt>
        <dd>{formatTime(revision.submittedAt)}</dd>
      </dl>

      {revision.state === 'draft' && can.edit ? (
        <form className="review-form" onSubmit={submit}>
          {can.verifiedNames ? null : (
            <div className="field">
              <label htmlFor="designer" className="field__label">
                {m.review.designerField}
              </label>
              <div className="field__box">
                <input id="designer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            </div>
          )}
          {confirming ? (
            <div className="review-confirm" role="group" aria-label={m.review.confirmSubmit}>
              <p>{m.review.submitConfirm(rev, blockers.length)}</p>
              <div className="review-form__actions">
                <button type="submit" className="btn btn--ink">
                  {m.review.confirmSubmit}
                </button>
                {cancel}
              </div>
            </div>
          ) : (
            <>
              <button type="submit" className="btn btn--ink">
                {m.review.submit}
              </button>
              <p className="review-note">{m.review.submitNote}</p>
            </>
          )}
        </form>
      ) : null}

      {revision.state === 'in_review' && !can.review && !archived ? (
        <div className="review-form">
          <p className="review-note">{m.review.reviewersOnly}</p>
          {can.edit ? (
            <div className="review-form__actions">
              <button type="button" className="btn" onClick={newDraft}>
                {m.review.startDraft}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {revision.state === 'in_review' && can.review ? (
        <form className="review-form" onSubmit={approve}>
          {can.verifiedNames ? null : (
            <div className="field">
              <label htmlFor="reviewer" className="field__label">
                {m.review.reviewerField}
              </label>
              <div className="field__box">
                <input id="reviewer" className="field__input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            </div>
          )}
          {confirming ? (
            <div className="review-confirm" role="group" aria-label={m.review.confirmApprove}>
              <p>{m.review.approveConfirm(rev, who.trim() || m.review.unnamedReviewer)}</p>
              {revision.designedBy && sameName(revision.designedBy.name, who) ? <p className="review-confirm__warn">{m.review.selfApproveWarn}</p> : null}
              <div className="review-form__actions">
                <button type="submit" className="btn btn--ink">
                  {m.review.confirmApprove}
                </button>
                {cancel}
              </div>
            </div>
          ) : (
            <div className="review-form__actions">
              <button type="submit" className="btn btn--ink" disabled={blockers.length > 0 || ownSubmission} aria-describedby={blockers.length > 0 ? 'approve-blocked' : undefined}>
                {m.review.approve}
              </button>
              {can.edit ? (
                <button type="button" className="btn" onClick={newDraft}>
                  {m.review.startDraft}
                </button>
              ) : null}
            </div>
          )}
          {ownSubmission && !confirming ? <p className="review-note">{m.review.ownSubmission}</p> : null}
          {blockers.length > 0 && !confirming ? (
            <p id="approve-blocked" className="review-note">
              {m.review.approveBlocked(blockers.length)}
            </p>
          ) : null}
        </form>
      ) : null}

      {blockers.length > 0 ? (
        <div className="blockers">
          <h3>{m.review.blockedBy}</h3>
          <ul>
            {blockers.map((b, i) => (
              <li key={`${b.code}-${i}`}>{blockerText(m, b)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="review-ready">{m.review.ready}</p>
      )}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      {revision.state === 'draft' && can.edit ? <DiscardDraft roomId={roomId} plan={plan} /> : null}
    </section>
  );
}

/** A draft started from an earlier revision can be thrown away; the room goes back to that revision. */
function DiscardDraft({ roomId, plan }: { roomId: string; plan: Plan }) {
  const m = useT();
  const review = useReviewCommit(roomId);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = currentRevision(plan);
  const back = plan.revisions[plan.revisions.length - 2];
  if (!back) return null;
  const discard = (): void => {
    const problem = review({ type: 'review/discard-draft', at: now() });
    setError(problem);
    if (problem === null) setConfirming(false);
  };
  return (
    <div className="discard-draft">
      {confirming ? (
        <div className="review-confirm review-confirm--danger" role="group" aria-label={m.review.confirmDiscard}>
          <p>{m.review.discardConfirm(pad2(draft.number), pad2(back.number), m.revision.state[back.state])}</p>
          <div className="review-form__actions">
            <button type="button" className="btn btn--danger" onClick={discard}>
              {m.review.confirmDiscard}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
              {m.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn--danger btn--sm" onClick={() => setConfirming(true)}>
            {m.review.discardDraft(pad2(draft.number))}
          </button>
          <p className="review-note">{m.review.discardNote(pad2(back.number))}</p>
        </>
      )}
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
