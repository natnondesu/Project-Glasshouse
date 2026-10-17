import { z } from 'zod';

// By default zod probes `Function('')` to see whether it may compile parsers. In a browser under a content
// security policy without 'unsafe-eval' that probe is reported as a violation, although zod would fall back to plain
// parsing anyway. So browsers skip the probe; the server (no `document`) keeps the compiled parsers.
// Every schema module imports `z` from here, so this runs before any schema is built.
if ('document' in globalThis) z.config({ jitless: true });

export { z };
