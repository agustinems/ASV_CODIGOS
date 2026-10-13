import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const embedded = process.env.VITE_ASV_EMBEDDED === '1';

export default defineConfig({
  root: resolve(__dirname, 'spa'),
  publicDir: resolve(__dirname, 'public'),
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': resolve(__dirname) } },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, embedded ? 'dist-esp32' : 'dist-spa'),
    emptyOutDir: true,
    target: 'es2022',
  },
});
