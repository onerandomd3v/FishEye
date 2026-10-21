import { defineConfig, globalIgnores } from 'eslint/config';
import nextTypeScript from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import baseConfig from '../../../eslint.config.mjs';

export default defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTypeScript,
  { settings: { next: { rootDir: '.' } } },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
