// Vitest writes lcov paths relative to each package ("SF:src/x.ts"); SonarQube resolves them
// from the repository root, so prefix them with the package directory. Safe to run twice.
import { readFileSync, writeFileSync } from 'node:fs';

const reports = ['packages/domain', 'apps/server', 'apps/web'];

for (const dir of reports) {
  const file = `${dir}/coverage/lcov.info`;
  const rebased = readFileSync(file, 'utf8').replace(/^SF:(?!\/)(.+)$/gm, (line, path) =>
    path.startsWith(`${dir}/`) ? line : `SF:${dir}/${path}`,
  );
  writeFileSync(file, rebased);
}
