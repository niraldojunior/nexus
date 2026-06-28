import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  prettier,
  ...tseslint.configs.recommended,
  {
    ignores: ['docs/03-design-system/**', 'dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
