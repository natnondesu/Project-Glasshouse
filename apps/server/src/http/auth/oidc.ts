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

/** Only same-site paths: never an absolute or protocol-relative URL. */
export const safeReturnTo = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
