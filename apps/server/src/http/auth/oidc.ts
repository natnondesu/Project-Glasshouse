import * as client from 'openid-client';

export interface OidcClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OidcLogin {
  /** The IdP URL to send the browser to. */
  start(returnTo: string): Promise<string>;
  finish(callbackUrl: URL): Promise<{ claims: OidcClaims; returnTo: string }>;
}

export class OidcError extends Error {}

/** A sign-in started but never finished is forgotten after this; the map is also capped. */
const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_MAX = 1000;
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/** Only same-site paths: never an absolute or protocol-relative URL. */
export const safeReturnTo = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';

export async function createOidcLogin(options: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; now?: () => number }): Promise<OidcLogin> {
  const now = options.now ?? (() => Date.now());
  const issuer = new URL(options.issuer);
  // Plain http only for a loopback test IdP; Authelia is always https.
  const insecure = issuer.protocol === 'http:' && LOOPBACK.has(issuer.hostname);
  const config = await client.discovery(issuer, options.clientId, options.clientSecret, undefined, insecure ? { execute: [client.allowInsecureRequests] } : undefined);
  const pending = new Map<string, { verifier: string; nonce: string; returnTo: string; at: number }>();
  const prune = (): void => {
    const cutoff = now() - PENDING_TTL_MS;
    for (const [state, p] of pending) if (p.at < cutoff) pending.delete(state);
    while (pending.size >= PENDING_MAX) pending.delete(pending.keys().next().value!);
  };
  return {
    async start(returnTo) {
      prune();
      const state = client.randomState();
      const verifier = client.randomPKCECodeVerifier();
      const nonce = client.randomNonce();
      pending.set(state, { verifier, nonce, returnTo: safeReturnTo(returnTo), at: now() });
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: options.redirectUri,
        scope: 'openid profile email',
        code_challenge: await client.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      });
      return url.href;
    },
    async finish(callbackUrl) {
      const error = callbackUrl.searchParams.get('error');
      if (error) throw new OidcError(error === 'access_denied' ? 'Sign-in was cancelled.' : `The company sign-in refused: ${error}.`);
      const state = callbackUrl.searchParams.get('state') ?? '';
      const p = pending.get(state);
      if (!p || p.at < now() - PENDING_TTL_MS) throw new OidcError('This sign-in link has expired. Try again.');
      pending.delete(state);
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, { pkceCodeVerifier: p.verifier, expectedState: state, expectedNonce: p.nonce });
      const c = tokens.claims();
      if (!c?.sub) throw new OidcError('The company sign-in did not say who you are.');
      const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
      return { claims: { sub: c.sub, email: str(c.email), emailVerified: c.email_verified === true, name: str(c.name) ?? str(c.preferred_username) }, returnTo: p.returnTo };
    },
  };
}
