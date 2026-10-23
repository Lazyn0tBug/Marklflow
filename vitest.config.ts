import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { css: true, environment: 'jsdom', include: ['tests/unit/**/*.test.ts'], testTimeout: 15000 } });
