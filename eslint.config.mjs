import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  js.configs.recommended,
  ...astro.configs['flat/recommended'],
  prettier,
  globalIgnores([
    '**/.next/**',
    '**/.astro/**',
    '**/dist/**',
    '**/coverage/**',
    '**/next-env.d.ts',
  ]),
]);
