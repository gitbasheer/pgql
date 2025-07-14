import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache'
    ],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/fixtures/',
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/types/**',
        'vitest.config.ts',
        'vitest.setup.ts',
        'scripts/**'
      ],
      all: true,
      clean: true,
      skipFull: false,
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true
      }
    },
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json'
    },
    sequence: {
      concurrent: true
    },
    // ESM-specific settings
    server: {
      deps: {
        inline: ['@babel/types', 'chalk', 'ora', 'commander']
      }
    },
    deps: {
      interopDefault: true,
      moduleDirectories: ['node_modules', 'src']
    },
    // Mock settings
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    // Performance settings
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    // Reporter settings
    reporters: ['verbose'],
    // Watch settings
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/.cache/**']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './src/test'),
      '@core': resolve(__dirname, './src/core'),
      '@cli': resolve(__dirname, './src/cli'),
      '@utils': resolve(__dirname, './src/utils'),
      '@types': resolve(__dirname, './src/types')
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
  },
  esbuild: {
    target: 'es2022',
    format: 'esm'
  },
  optimizeDeps: {
    include: ['graphql', '@babel/parser', '@babel/traverse', '@babel/types']
  }
}); 