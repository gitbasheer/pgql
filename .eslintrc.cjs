module.exports = {
  extends: ['google', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json', './ui/tsconfig.json', './test/tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  rules: {
    'require-jsdoc': ['warn', { 
      require: { 
        FunctionDeclaration: true,
        MethodDefinition: true,
        ClassDeclaration: true,
        ArrowFunctionExpression: false,
        FunctionExpression: false
      } 
    }],
    // Custom pgql: Warn on missing @configurable
    // Add eslint-plugin-jsdoc if needed for tags
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
    'new-cap': 'off',
    'camelcase': 'off',
    'valid-jsdoc': 'off',
    'guard-for-in': 'off',
    'no-invalid-this': 'off'
  },
  env: {
    node: true,
    es2022: true
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    '*.cjs',
    '*.d.ts',
    'coverage/',
    'ui/dist/',
    'ui/node_modules/',
    'vitest.config.ts',
    'vite.config.ts',
    'cypress.config.ts',
    'ui/vitest.config.ts',
    'ui/vite.config.ts',
    'ui/cypress.config.ts'
  ]
};