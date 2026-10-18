import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as client from 'openid-client';

export interface OidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OidcLogin {
  /** The IdP URL to send the browser to, and a secret to keep in that browser's cookie until the callback. */
  start(returnTo: string): Promise<{ url: string; binding: string }>;
  /** `binding` is the cookie value the callback request arrived with: a sign-in only finishes in the browser that started it. */
  finish(callbackUrl: URL, binding: string | null): Promise<{ claims: OidcClaims; returnTo: string }>;
  /** Discovers now; failures are logged and retried on the next sign-in. */
  warmUp(): Promise<void>;
}

/** What the sign-in screen is told when a company sign-in fails. The browser words these itself, in the reader's language. */
export type SigninErrorCode = 'cancelled' | 'expired' | 'unavailable' | 'refused' | 'exists' | 'switched_off' | 'removed' | 'generic';

export class OidcError extends Error {
  constructor(readonly code: SigninErrorCode) {
    super(code);
  }
}

/** A sign-in started but never finished is forgotten after this; the map is also capped. */
const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_MAX = 1000;
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

const URL_BASE = 'http://glasshouse.invalid';
// Control characters and whitespace: browsers strip tabs and newlines from a Location, so "/\t/evil.com" would become "//evil.com".
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\s\\]/;

/** Only same-site paths: never an absolute or protocol-relative URL. */
export const safeReturnTo = (value: unknown): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || UNSAFE_CHARS.test(value)) return '/';
  try {
    const parsed = new URL(value, URL_BASE);
    const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // Dot segments can collapse "/..//evil.com" into "//evil.com".
    return parsed.origin === URL_BASE && !target.startsWith('//') ? target : '/';
  } catch {
    return '/';
  }
};

// A Map, not an object: `?error=constructor` must not find Object's own properties.
const FAILURE_CODES = new Map<string, SigninErrorCode>([
  ['access_denied', 'cancelled'],
  ['login_required', 'refused'],
  ['interaction_required', 'refused'],
  ['consent_required', 'refused'],
  ['temporarily_unavailable', 'unavailable'],
  ['server_error', 'unavailable'],
]);

const sameSecret = (a: string, b: string): boolean => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function createOidcLogin(options: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; now?: () => number; warn?: (message: string) => void }): OidcLogin {
  const now = options.now ?? (() => Date.now());
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const issuer = new URL(options.issuer);
  // Plain http only for a loopback test IdP; Authelia is always https.
  const insecure = issuer.protocol === 'http:' && LOOPBACK.has(issuer.hostname);
  let discovered: Promise<client.Configuration> | null = null;
  // Discovery on first use, retried after a failure: an Authelia outage at deploy time must not take
  // local password sign-in down with it.
  const getConfig = (): Promise<client.Configuration> => {
    discovered ??= client
      .discovery(issuer, options.clientId, undefined, client.ClientSecretBasic(options.clientSecret), insecure ? { execute: [client.allowInsecureRequests] } : undefined)
      .catch((e: unknown) => {
        discovered = null;
        warn(`Company sign-in: could not reach ${issuer.origin} for discovery (${e instanceof Error ? e.message : String(e)}).`);
        throw new OidcError('unavailable');
      });
    return discovered;
  };
  const pending = new Map<string, { verifier: string; nonce: string; binding: string; returnTo: string; at: number }>();
  const prune = (): void => {
    const cutoff = now() - PENDING_TTL_MS;
    for (const [state, p] of pending) if (p.at < cutoff) pending.delete(state);
    while (pending.size >= PENDING_MAX) pending.delete(pending.keys().next().value!);
  };
  return {
    async start(returnTo) {
      const config = await getConfig();
      prune();
      const state = client.randomState();
      const verifier = client.randomPKCECodeVerifier();
      const nonce = client.randomNonce();
      const binding = randomBytes(32).toString('base64url');
      pending.set(state, { verifier, nonce, binding, returnTo: safeReturnTo(returnTo), at: now() });
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: options.redirectUri,
        scope: 'openid profile email',
        code_challenge: await client.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      });
      return { url: url.href, binding };
    },
    async warmUp() {
      await getConfig();
    },
    async finish(callbackUrl, binding) {
      const config = await getConfig();
      const state = callbackUrl.searchParams.get('state') ?? '';
      const p = pending.get(state);
      // Single use, whatever happens next.
      pending.delete(state);
      const error = callbackUrl.searchParams.get('error');
      if (error) throw new OidcError(FAILURE_CODES.get(error) ?? 'refused');
      if (!p || p.at < now() - PENDING_TTL_MS || binding === null || !sameSecret(binding, p.binding)) throw new OidcError('expired');
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier: p.verifier, expectedState: state, expectedNonce: p.nonce });
      const c = tokens.claims();
      if (!c?.sub) throw new OidcError('generic');
      let email = text(c.email);
      let emailVerified = c.email_verified === true;
      let name = text(c.name) ?? text(c.preferred_username);
      // Some providers (recent Authelia) keep profile claims out of the ID token.
      if ((!email || !name) && tokens.access_token) {
        try {
          const info = await client.fetchUserInfo(config, tokens.access_token, c.sub);
          if (!email) {
            email = text(info.email);
            emailVerified = info.email_verified === true;
          }
          name ??= text(info.name) ?? text(info.preferred_username);
        } catch (e) {
          warn(`Company sign-in: could not read the profile from the userinfo endpoint (${e instanceof Error ? e.name : 'unknown error'}); continuing with the ID token.`);
        }
      }
      return { claims: { sub: c.sub, email, emailVerified, name }, returnTo: p.returnTo };
    },
  };
}
