import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import custom from 'eslint-plugin-custom';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
    eslint.configs.recommended,
    prettier,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        languageOptions: {
            globals: { ...globals.node, ...globals.jest },
            parserOptions: {
                project: 'tsconfig.json',
                sourceType: 'module',
            },
        },
        plugins: {
            'simple-import-sort': simpleImportSort,
            custom: custom,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            'custom/non-ascii': [
                'error',
                { allowedChars: 'àÀáéíóúÁÉÍÓÚâêôÂÊÔãõÃÕçÇ' },
            ],
            'id-match': [
                'error',
                '^[a-zA-Z0-9_$]*$',
                { properties: true, classFields: true },
            ],
            'no-console': 'warn',
            'no-duplicate-imports': 'error',
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-extraneous-class': 'off',
            '@typescript-eslint/explicit-module-boundary-types': [
                'error',
                {
                    allowArgumentsExplicitlyTypedAsAny: true,
                },
            ],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/promise-function-async': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/restrict-template-expressions': 'error',
        },
    },
);
