import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/brd/**', 'src/extractor/**', 'src/scraper/catalogDetector.ts', 'src/scraper/policyExtractor.ts'],
      exclude: ['src/**/*.test.ts', 'src/smoke/**'],
    },
  },
});
