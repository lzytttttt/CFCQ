import { defineConfig } from 'vite';

export default defineConfig({
  // 开发服务器配置：方便浏览器直接访问
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
