import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: [{ find: /^@infinity\/config-core$/, replacement: fileURLToPath(new URL('../config-core/src/index.ts', import.meta.url)) }] },
  test: { environment: 'happy-dom' },
});
