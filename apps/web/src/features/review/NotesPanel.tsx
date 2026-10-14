import { newId, type Plan } from '@glasshouse/domain';
import { useState, type FormEvent } from 'react';
import { useReviewCommit } from '../../store/hooks';
import { formatTime } from '../../ui/time';
import { useT } from '../../i18n';

export function NotesPanel({ roomId, plan, frozen }: { roomId: string; plan: Plan; frozen: boolean }) {
  const review = useReviewCommit(roomId);
  const m = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = (e: FormEvent): void => {
    e.preventDefault();
    const problem = review({ type: 'note/add', id: newId(), text, at: new Date().toISOString() });
    setError(problem);
    if (problem === null) setText('');
  };
  return (
    <section className="review-card glass" aria-labelledby="notes-h">
      <h2 id="notes-h">{m.review.notes}</h2>
      <form className="review-form" onSubmit={add}>
        <fieldset disabled={frozen} className="inspector__lock">
          <div className="field">
            <label htmlFor="new-note" className="field__label">
              {m.review.newNote}
            </label>
            <div className="field__box field__box--multiline">
              <textarea id="new-note" className="field__input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn--sm">
            {m.review.addNote}
          </button>
        </fieldset>
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
      </form>
      {plan.notes.length === 0 ? <p className="review-note">{m.review.noNotes}</p> : null}
      <ul className="notes">
        {plan.notes.map((n) => (
          <li key={n.id} className={`notes__item${n.resolved ? ' is-resolved' : ''}`}>
            <input
              id={`note-${n.id}`}
              type="checkbox"
              checked={n.resolved}
              disabled={frozen}
              onChange={(e) => setError(review({ type: 'note/resolve', id: n.id, resolved: e.target.checked, at: new Date().toISOString() }))}
            />
            <label htmlFor={`note-${n.id}`}>{n.text}</label>
            <span className="notes__time">{formatTime(n.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
