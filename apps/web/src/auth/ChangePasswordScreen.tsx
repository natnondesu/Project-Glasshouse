import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import '../ui/fields.css';
import { changePassword } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

export function ChangePasswordScreen() {
  const m = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (next !== again) return setError(m.auth.mismatch);
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      await useAuthStore.getState().init();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const field = (id: string, label: string, value: string, set: (v: string) => void, complete: string) => (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}</label>
      <div className="field__box"><input id={id} className="field__input" type="password" autoComplete={complete} value={value} onChange={(e) => set(e.target.value)} required /></div>
    </div>
  );
  return (
    <main className="signin" aria-labelledby="pw-h">
      <form className="signin__card glass review-form" onSubmit={(e) => void submit(e)}>
        <h1 id="pw-h">{m.auth.changeTitle}</h1>
        <p className="signin__note">{m.auth.changeNote}</p>
        {error ? <p role="alert" className="field__error">{error}</p> : null}
        {field('pw-current', m.auth.temporary, current, setCurrent, 'current-password')}
        {field('pw-next', m.auth.newPassword, next, setNext, 'new-password')}
        {field('pw-again', m.auth.newAgain, again, setAgain, 'new-password')}
        <button type="submit" className="btn btn--ink" disabled={busy}>{m.auth.change}</button>
      </form>
    </main>
  );
}
