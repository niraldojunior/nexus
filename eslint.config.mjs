import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  prettier,
  ...tseslint.configs.recommended,
  {
    ignores: ['docs/4-design-system/**', 'dist/**', 'web/dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      // O prefixo `_` marca um binding deliberadamente nao usado (parametro exigido
      // pela assinatura, descarte de destructuring, erro capturado e ignorado).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx,js,jsx}', 'src/shared/ui/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
