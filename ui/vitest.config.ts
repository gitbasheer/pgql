import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(__dirname, './test/setup.ts')],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@types': resolve(__dirname, '../src/types'),
    },
  },
});