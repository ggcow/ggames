import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'shared', include: ['tests/shared/**/*.test.ts'], environment: 'node' },
      },
      {
        test: { name: 'client', include: ['tests/client/**/*.test.ts'], environment: 'happy-dom' },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        test: { name: 'worker', include: ['tests/worker/**/*.test.ts'], setupFiles: ['tests/worker/setup.ts'] },
      },
    ],
  },
});
