import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // 引擎核心为纯逻辑，无需 DOM 环境
    include: ['tests/**/*.test.ts'],
  },
});
