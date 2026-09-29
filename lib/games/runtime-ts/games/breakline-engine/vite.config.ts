import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'emit-mint-asset-registry',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'mint-assets.json',
          source: fs.readFileSync(path.resolve(__dirname, 'mint-assets.json'), 'utf8'),
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, '../../engine'),
    },
  },
  server: {
    port: 3018,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
