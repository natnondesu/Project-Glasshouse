import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { GlasshouseMark } from '../ui/icons';
import '../ui/fields.css';
import { login, ssoUrl } from './authApi';
import { useAuthStore } from './authStore';
import './auth.css';

export function SignInScreen() {
  const m = useT();
  const config = useAuthStore((s) => s.config);
  const sessionEnded = useAuthStore((s) => s.sessionEnded);
  const init = useAuthStore((s) => s.init);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('signin_error'));
  const here = `${window.location.pathname}${window.location.search.replace(/[?&]signin_error=[^&]*/, '')}` || '/';
  const sso = config?.mode === 'on' && config.sso;
  const local = config?.mode === 'on' && config.localLogin;
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      await init();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="signin" aria-labelledby="signin-h">
      <div className="signin__card glass">
        <header className="signin__head">
          <GlasshouseMark />
          <h1 id="signin-h">{m.auth.title}</h1>
          <LanguageSwitch />
        </header>
        {sessionEnded ? <p className="signin__note">{m.auth.sessionEnded}</p> : null}
        {error ? (
          <p role="alert" className="field__error">
            {error}
          </p>
        ) : null}
        {sso ? (
          <a className="btn btn--ink signin__sso" href={ssoUrl(here)}>
            {m.auth.sso}
          </a>
        ) : null}
        {sso && local ? <p className="signin__or">{m.auth.or}</p> : null}
        {local ? (
          <form className="review-form" onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label htmlFor="signin-email" className="field__label">{m.auth.email}</label>
              <div className="field__box"><input id="signin-email" className="field__input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            </div>
            <div className="field">
              <label htmlFor="signin-password" className="field__label">{m.auth.password}</label>
              <div className="field__box"><input id="signin-password" className="field__input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            </div>
            <button type="submit" className="btn" disabled={busy}>{m.auth.signIn}</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
