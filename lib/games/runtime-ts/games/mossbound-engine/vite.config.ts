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
    port: 3004,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
