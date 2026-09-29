import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../../engine'),
    },
  },
  server: {
    port: 3019,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
