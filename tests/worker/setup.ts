import { reset } from 'cloudflare:test';
import { afterEach } from 'vitest';

// Chaque test part d'une base vide.
afterEach(async () => {
  await reset();
});
