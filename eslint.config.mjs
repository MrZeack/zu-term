import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/target/**',
      'apps/desktop/src-tauri/gen/**',
      '.run/**',
      'logs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/desktop/src/**'],
    languageOptions: { globals: globals.browser },
    rules: { 'no-console': ['error', { allow: ['error'] }] },
  },
  {
    files: ['**/*.{js,mjs}', 'apps/desktop/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // Formatting belongs to Prettier.
  prettierConfig,
);
