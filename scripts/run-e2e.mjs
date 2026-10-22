import { randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.FISHEYE_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'Set FISHEYE_TEST_DATABASE_URL to a disposable local fisheye_test database.',
  );
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const allowedHost = ['localhost', '127.0.0.1', 'postgres'].includes(
  parsed.hostname,
);
const dbName = decodeURIComponent(parsed.pathname.slice(1));
const targetOverrides = [
  'host',
  'hostaddr',
  'dbname',
  'service',
  'servicefile',
];
if (
  !allowedHost ||
  dbName !== 'fisheye_test' ||
  [...parsed.searchParams.keys()].some((key) =>
    targetOverrides.includes(key.toLowerCase()),
  )
) {
  console.error(
    'E2E tests only allow the fisheye_test database on a local or CI service host, without connection target overrides.',
  );
  process.exit(1);
}

const artifactDirectory = resolve(repositoryRoot, 'var/fisheye-artifacts/e2e');
mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
const encryptionKeyPath = join(artifactDirectory, 'fernet.key');
let encryptionKey;
try {
  encryptionKey = readFileSync(encryptionKeyPath, 'utf8').trim();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  encryptionKey = randomBytes(32).toString('base64');
  try {
    writeFileSync(encryptionKeyPath, encryptionKey, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (writeError) {
    if (writeError.code !== 'EEXIST') throw writeError;
    encryptionKey = readFileSync(encryptionKeyPath, 'utf8').trim();
  }
}
if (!/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey)) {
  throw new Error(
    `Invalid E2E artifact encryption key at ${encryptionKeyPath}.`,
  );
}
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  FISHEYE_ENV: 'development',
  FISHEYE_ENABLE_DEV_CSV_VALIDATION: '1',
  FISHEYE_ENABLE_DEV_CSV_IMPORT: '1',
  FISHEYE_ENABLE_DEV_DATASET_READS: '1',
  FISHEYE_ENABLE_DEV_EVALUATION_RUNS: '1',
  FISHEYE_ARTIFACT_DIR: artifactDirectory,
  FISHEYE_ARTIFACT_ENCRYPTION_KEY: encryptionKey,
  FISHEYE_DEMO_EMAIL: 'e2e-analyst@example.test',
  FISHEYE_DEMO_PASSWORD: randomBytes(24).toString('base64url'),
  FISHEYE_SESSION_SECRET: randomBytes(32).toString('base64url'),
  FISHEYE_CONSOLE_URL: 'http://127.0.0.1:3000',
  API_INTERNAL_URL: 'http://127.0.0.1:8000',
};

execFileSync(
  'uv',
  [
    'run',
    '--locked',
    '--package',
    'fisheye-api',
    'alembic',
    '-c',
    'apps/backend/api/alembic.ini',
    'upgrade',
    'head',
  ],
  { cwd: repositoryRoot, env: environment, stdio: 'inherit' },
);
const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--config', 'playwright.config.ts'],
  {
    cwd: resolve(repositoryRoot, 'apps/web/console'),
    env: environment,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
