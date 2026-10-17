import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerSecurityHeaders } from './security';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function headersFor(https: boolean) {
  const app = Fastify();
  apps.push(app);
  await registerSecurityHeaders(app, { https });
  app.get('/x', async () => ({ ok: true }));
  return (await app.inject({ url: '/x' })).headers;
}

describe('security headers', () => {
  it.each(["default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"])('the policy says %s', async (directive) => {
    const csp = String((await headersFor(true))['content-security-policy']);
    expect(csp.split(';')).toContain(directive);
  });

  it('never allows inline or eval scripts', async () => {
    const csp = String((await headersFor(true))['content-security-policy']);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it('stops type sniffing and trims the referrer', async () => {
    const h = await headersFor(true);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('asks for HTTPS only when the public address is https', async () => {
    expect(String((await headersFor(true))['strict-transport-security'])).toContain('max-age=31536000');
    expect((await headersFor(false))['strict-transport-security']).toBeUndefined();
  });

  it('does not say which framework answered', async () => {
    expect((await headersFor(true))['x-powered-by']).toBeUndefined();
  });
});
