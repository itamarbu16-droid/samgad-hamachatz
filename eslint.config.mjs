import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.tsx'], plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
  globalIgnores(['.next/**', '.data/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts']),
]);
