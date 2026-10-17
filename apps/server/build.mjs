import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Bundle our own source and @glasshouse/domain; leave the server's npm dependencies to node_modules.
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@glasshouse/'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: [...external, 'pg-native'],
  // The domain's own dependencies (immer, zod, polygon-clipping) are bundled.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
