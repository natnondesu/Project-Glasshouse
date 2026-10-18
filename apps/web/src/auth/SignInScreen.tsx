import { useEffect, useState, type FormEvent } from 'react';
import { useT, type Messages } from '../i18n';
import { IconAlertCircle, IconBuilding } from '../ui/icons';
import '../ui/fields.css';
import { stashCount } from '../sync/pendingStash';
import { login, LoginRefusedError, ssoUrl } from './authApi';
import { AuthShell } from './AuthShell';
import { useAuthStore } from './authStore';
import { Swiftlet } from './brand/Swiftlet';

function pathWithoutSigninError(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('signin_error');
  return `${url.pathname}${url.search}${url.hash}`;
}

type SigninErrorCode = keyof Messages['auth']['signinError'];

/** The server sends a code, never text: anything else in the address (a hand-made link) reads as the generic failure. */
function signinErrorCode(known: Messages['auth']['signinError']): SigninErrorCode | null {
  const value = new URLSearchParams(window.location.search).get('signin_error');
  if (value === null) return null;
  return Object.hasOwn(known, value) ? (value as SigninErrorCode) : 'generic';
}

export function SignInScreen() {
  const m = useT();
  const config = useAuthStore((s) => s.config);
  const sessionEnded = useAuthStore((s) => s.sessionEnded);
  const init = useAuthStore((s) => s.init);
  const startupError = useAuthStore((s) => s.error);
  const [unsent] = useState(stashCount);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [urlCode] = useState(() => signinErrorCode(m.auth.signinError));
  const [dismissedUrl, setDismissedUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentialsRefused, setCredentialsRefused] = useState(false);
  const here = pathWithoutSigninError();
  const urlError = urlCode && !dismissedUrl ? m.auth.signinError[urlCode] : null;
  const shownError = error ?? urlError ?? startupError;
  const sso = config?.mode === 'on' && config.sso;
  const local = config?.mode === 'on' && config.localLogin;
  useEffect(() => {
    // The refusal is shown once; reloading or sharing this address shouldn't bring it back.
    if (new URLSearchParams(window.location.search).has('signin_error')) window.history.replaceState(null, '', here);
  }, [here]);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCredentialsRefused(false);
    setDismissedUrl(true);
    try {
      await login(email.trim(), password);
      await init();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCredentialsRefused(err instanceof LoginRefusedError && err.status === 401);
    } finally {
      setBusy(false);
    }
  };
  const alertId = 'signin-alert';
  // Above the password form when there is one (as in the design); otherwise straight under the title, ahead of the company button.
  const alert = shownError ? (
    <p role="alert" id={alertId} className="signin__alert">
      <IconAlertCircle />
      {shownError}
    </p>
  ) : null;
  return (
    <AuthShell labelledBy="signin-h">
      <div className="signin__card">
        <header className="signin__head">
          <img src="/brand/glasshouse-mark-color.svg" width="40" height="40" alt="" />
          <h1 id="signin-h">{m.auth.title}</h1>
          <p className="signin__lead">{m.auth.useWork}</p>
        </header>
        {sessionEnded ? <p className="signin__note">{m.auth.sessionEnded}</p> : null}
        {unsent > 0 ? <p className="signin__note">{m.auth.unsent(unsent)}</p> : null}
        {local ? null : alert}
        {sso ? (
          <a className="signin__sso" href={ssoUrl(here)}>
            <IconBuilding />
            {m.auth.sso}
          </a>
        ) : null}
        {sso && local ? <p className="signin__or">{m.auth.or}</p> : null}
        {local ? alert : null}
        {startupError ? (
          <button type="button" className="btn" onClick={() => void init()}>
            {m.auth.tryAgain}
          </button>
        ) : null}
        {local ? (
          <form className="signin__form" onSubmit={(e) => void submit(e)}>
            <div className="field">
              <label htmlFor="signin-email" className="field__label">{m.auth.email}</label>
              <div className={`field__box${credentialsRefused ? ' field__box--error' : ''}`}>
                <input id="signin-email" className="field__input" type="email" autoComplete="username" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={credentialsRefused || undefined} aria-describedby={credentialsRefused ? alertId : undefined} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="signin-password" className="field__label">{m.auth.password}</label>
              <div className={`field__box${credentialsRefused ? ' field__box--error' : ''}`}>
                <input id="signin-password" className="field__input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={credentialsRefused || undefined} aria-describedby={credentialsRefused ? alertId : undefined} required />
                <button type="button" className="signin__reveal" aria-label={showPassword ? m.auth.hidePassword : m.auth.showPassword} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? m.auth.hide : m.auth.show}
                </button>
              </div>
              <p className="signin__hint">{m.auth.forgot}</p>
            </div>
            <button type="submit" className="signin__submit" disabled={busy} aria-busy={busy}>
              {busy ? <Swiftlet /> : null}
              {busy ? m.auth.signingIn : m.auth.signIn}
            </button>
          </form>
        ) : null}
        <p className="signin__noaccount">{m.auth.noAccount}</p>
      </div>
    </AuthShell>
  );
}
