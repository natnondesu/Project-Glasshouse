import { z } from 'zod';
import { isRole, type Role } from './identity/types';
import { parseSeedUsers, type SeedUser } from './identity/seedUsers';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1).optional(),
  GLASSHOUSE_STORE: z.enum(['postgres', 'memory']).default('postgres'),
  GLASSHOUSE_AUTH: z.enum(['dev-insecure', 'on']).optional(),
  GLASSHOUSE_WEB_DIR: z.string().min(1).optional(),
  GLASSHOUSE_SEED_SAMPLE: z.enum(['0', '1']).default('0'),
  GLASSHOUSE_PUBLIC_URL: z.string().url().optional(),
  GLASSHOUSE_LOCAL_LOGIN: z.enum(['on', 'off']).default('on'),
  GLASSHOUSE_OIDC_ISSUER: z.string().url().optional(),
  GLASSHOUSE_OIDC_CLIENT_ID: z.string().min(1).optional(),
  GLASSHOUSE_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  GLASSHOUSE_BOOTSTRAP_ADMIN: z.string().email().optional(),
  GLASSHOUSE_DEFAULT_ROLE: z.string().default('viewer'),
  GLASSHOUSE_SEED_USERS: z.string().min(1).optional(),
});

export interface AuthConfig {
  mode: 'on';
  publicUrl: URL;
  localLogin: boolean;
  oidc: { issuer: string; clientId: string; clientSecret: string } | null;
  bootstrapAdmin: string | null;
  defaultRole: Role;
  secureCookies: boolean;
  seedUsers: SeedUser[];
}

export interface Config {
  port: number;
  host: string;
  store: 'postgres' | 'memory';
  databaseUrl: string | null;
  auth: { mode: 'dev-insecure' } | AuthConfig;
  webDir: string | null;
  seedSample: boolean;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function authConfig(c: z.infer<typeof schema>): AuthConfig {
  if (!c.GLASSHOUSE_PUBLIC_URL) throw new Error('GLASSHOUSE_PUBLIC_URL is required when GLASSHOUSE_AUTH=on (e.g. https://glasshouse.company.local).');
  const publicUrl = new URL(c.GLASSHOUSE_PUBLIC_URL);
  if (publicUrl.protocol !== 'https:' && !LOOPBACK.has(publicUrl.hostname)) {
    throw new Error('GLASSHOUSE_PUBLIC_URL must be https outside localhost: session cookies must not travel in the clear.');
  }
  const oidcParts = [c.GLASSHOUSE_OIDC_ISSUER, c.GLASSHOUSE_OIDC_CLIENT_ID, c.GLASSHOUSE_OIDC_CLIENT_SECRET];
  if (oidcParts.some(Boolean) && !oidcParts.every(Boolean)) {
    throw new Error('Set GLASSHOUSE_OIDC_ISSUER, GLASSHOUSE_OIDC_CLIENT_ID and GLASSHOUSE_OIDC_CLIENT_SECRET together.');
  }
  const oidc = c.GLASSHOUSE_OIDC_ISSUER ? { issuer: c.GLASSHOUSE_OIDC_ISSUER, clientId: c.GLASSHOUSE_OIDC_CLIENT_ID!, clientSecret: c.GLASSHOUSE_OIDC_CLIENT_SECRET! } : null;
  const localLogin = c.GLASSHOUSE_LOCAL_LOGIN === 'on';
  if (!localLogin && !oidc) throw new Error('Enable at least one way to sign in: OIDC settings, or GLASSHOUSE_LOCAL_LOGIN=on.');
  if (!isRole(c.GLASSHOUSE_DEFAULT_ROLE) || c.GLASSHOUSE_DEFAULT_ROLE === 'admin') {
    throw new Error('GLASSHOUSE_DEFAULT_ROLE must be viewer, editor or reviewer.');
  }
  if (c.GLASSHOUSE_SEED_USERS && c.GLASSHOUSE_STORE !== 'memory') throw new Error('GLASSHOUSE_SEED_USERS only works with GLASSHOUSE_STORE=memory (tests and e2e).');
  return {
    mode: 'on',
    publicUrl,
    localLogin,
    oidc,
    bootstrapAdmin: c.GLASSHOUSE_BOOTSTRAP_ADMIN ?? null,
    defaultRole: c.GLASSHOUSE_DEFAULT_ROLE,
    secureCookies: publicUrl.protocol === 'https:',
    seedUsers: c.GLASSHOUSE_SEED_USERS ? parseSeedUsers(c.GLASSHOUSE_SEED_USERS) : [],
  };
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid Glasshouse server configuration: ${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  if (!c.GLASSHOUSE_AUTH) throw new Error('GLASSHOUSE_AUTH is not set: use GLASSHOUSE_AUTH=on for a shared server, or dev-insecure for local development.');
  if (c.GLASSHOUSE_STORE === 'postgres' && !c.DATABASE_URL) throw new Error('DATABASE_URL is required when GLASSHOUSE_STORE=postgres.');
  return {
    port: c.PORT,
    host: c.HOST,
    store: c.GLASSHOUSE_STORE,
    databaseUrl: c.DATABASE_URL ?? null,
    auth: c.GLASSHOUSE_AUTH === 'on' ? authConfig(c) : { mode: 'dev-insecure' },
    webDir: c.GLASSHOUSE_WEB_DIR ?? null,
    seedSample: c.GLASSHOUSE_SEED_SAMPLE === '1',
  };
}
