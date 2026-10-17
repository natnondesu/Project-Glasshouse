import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

/**
 * Headers for every response. The web app is served from this same origin and loads nothing from elsewhere
 * (fonts are self-hosted, three.js is bundled), so 'self' covers it. blob:/data: are for downloads, thumbnails and 3D textures.
 */
export async function registerSecurityHeaders(app: FastifyInstance, { https }: { https: boolean }): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: https ? { maxAge: 31_536_000, includeSubDomains: false } : false,
  });
}
