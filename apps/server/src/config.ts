import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1).optional(),
  GLASSHOUSE_STORE: z.enum(['postgres', 'memory']).default('postgres'),
  GLASSHOUSE_AUTH: z.enum(['dev-insecure']).optional(),
  GLASSHOUSE_WEB_DIR: z.string().min(1).optional(),
  GLASSHOUSE_SEED_SAMPLE: z.enum(['0', '1']).default('0'),
});

export interface Config {
  port: number;
  host: string;
  store: 'postgres' | 'memory';
  databaseUrl: string | null;
  auth: 'dev-insecure';
  webDir: string | null;
  seedSample: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid Glasshouse server configuration: ${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  if (!c.GLASSHOUSE_AUTH) {
    throw new Error('GLASSHOUSE_AUTH is not set. This build only supports GLASSHOUSE_AUTH=dev-insecure, for local development.');
  }
  if (c.GLASSHOUSE_STORE === 'postgres' && !c.DATABASE_URL) throw new Error('DATABASE_URL is required when GLASSHOUSE_STORE=postgres.');
  return {
    port: c.PORT,
    host: c.HOST,
    store: c.GLASSHOUSE_STORE,
    databaseUrl: c.DATABASE_URL ?? null,
    auth: c.GLASSHOUSE_AUTH,
    webDir: c.GLASSHOUSE_WEB_DIR ?? null,
    seedSample: c.GLASSHOUSE_SEED_SAMPLE === '1',
  };
}
