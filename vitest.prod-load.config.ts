import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/prod-load/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
  },
});
