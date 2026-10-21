const databaseUrl = process.env.FISHEYE_TEST_DATABASE_URL;

if (!databaseUrl) {
  console.error(
    'Set FISHEYE_TEST_DATABASE_URL to a disposable local fisheye_test database.',
  );
  process.exit(1);
}

const parsed = new URL(databaseUrl);
const hostAllowed = ['localhost', '127.0.0.1', 'postgres'].includes(
  parsed.hostname,
);
const databaseName = decodeURIComponent(parsed.pathname.slice(1));

if (!hostAllowed || databaseName !== 'fisheye_test') {
  console.error(
    'Database checks only allow the fisheye_test database on a local or CI service host.',
  );
  process.exit(1);
}
