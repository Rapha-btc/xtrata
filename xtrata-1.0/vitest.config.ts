import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'browser-tests/**/*.test.ts',
      'src/**/*.test.ts',
      'functions/**/*.test.ts',
      'packages/**/*.test.ts'
    ]
  }
});
