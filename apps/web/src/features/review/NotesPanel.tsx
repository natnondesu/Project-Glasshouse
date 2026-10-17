import { newId, type Plan, type ReviewNote } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { pad2 } from '../../ui/StatusStamp';
import { formatTime } from '../../ui/time';
import { useT } from '../../i18n';

function NoteList({ notes }: { notes: ReviewNote[] }) {
  const m = useT();
  return (
    <ul className="notes">
      {[...notes].reverse().map((n) => (
        <li key={n.id} className="notes__item">
          <p className="notes__text">{n.text}</p>
          <span className="notes__meta">{n.by ? m.review.noteBy(n.by, formatTime(n.createdAt)) : formatTime(n.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Notes on each revision, for anyone opening it later: no resolving, and they never hold approval.
 * New notes go on the current revision, approved or not; earlier revisions' notes fold away below.
 */
export function NotesPanel({ roomId, plan }: { roomId: string; plan: Plan }) {
  const review = useReviewCommit(roomId);
  const m = useT();
  const [text, setText] = useState('');
  const [by, setBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = plan.revisions[plan.revisions.length - 1]!.number;
  const onRev = (n: number): ReviewNote[] => plan.notes.filter((x) => x.revision === n);
  const earlier = [...plan.revisions].reverse().filter((r) => r.number !== current && onRev(r.number).length > 0);
  const add = (e: FormEvent): void => {
    e.preventDefault();
    const problem = review({ type: 'note/add', id: newId(), text, by, at: new Date().toISOString() });
    setError(problem);
    if (problem === null) setText('');
  };
  return (
    <section className="review-card glass" aria-labelledby="notes-h">
      <h2 id="notes-h">{m.review.notesOn(pad2(current))}</h2>
      <p className="review-note">{m.review.notesNote}</p>
      <form className="review-form" onSubmit={add}>
        <div className="field">
          <label htmlFor="new-note" className="field__label">
            {m.review.newNote}
          </label>
          <div className="field__box field__box--multiline">
            <textarea id="new-note" className="field__input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        </div>
        <div className="review-form__row">
          <div className="field">
            <label htmlFor="note-by" className="field__label">
              {m.review.noteName}
            </label>
            <div className="field__box">
              <input id="note-by" className="field__input" autoComplete="name" value={by} onChange={(e) => setBy(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn--sm">
            {m.review.addNote}
          </button>
        </div>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </form>
      {onRev(current).length === 0 ? <p className="review-note">{m.review.noNotes}</p> : <NoteList notes={onRev(current)} />}
      {earlier.map((r) => (
        <details key={r.number} className="notes__earlier">
          <summary>{m.review.notesEarlier(pad2(r.number), onRev(r.number).length)}</summary>
          <NoteList notes={onRev(r.number)} />
        </details>
      ))}
    </section>
  );
}
