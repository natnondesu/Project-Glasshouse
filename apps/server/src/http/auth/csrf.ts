import type { FastifyRequest } from 'fastify';

/**
 * Changes need our own header (a cross-site form can't send it) and, when the browser says where the
 * request came from, our own origin. The SameSite=Lax cookie is the third layer.
 */
export function checkMutation(request: FastifyRequest, publicOrigin: string | null): string | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;
  if (request.headers['x-glasshouse'] !== '1') return 'This request is missing the Glasshouse header.';
  const origin = request.headers.origin;
  if (publicOrigin && typeof origin === 'string' && origin !== publicOrigin) return 'This request came from another site.';
  return null;
}
