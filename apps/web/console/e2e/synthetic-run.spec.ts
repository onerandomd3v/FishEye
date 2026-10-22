import { expect, test } from '@playwright/test';

test('a bundled synthetic dataset runs through API, worker, storage, and console', async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.on('response', (response) => {
    if (
      new URL(response.url()).pathname.startsWith('/api/backend/') &&
      response.status() >= 400
    ) {
      console.log(
        `[e2e] API proxy returned ${response.status()} for ${new URL(response.url()).pathname}`,
      );
    }
  });
  const email = process.env.FISHEYE_DEMO_EMAIL;
  const password = process.env.FISHEYE_DEMO_PASSWORD;
  expect(email, 'E2E demo email must be supplied by the runner').toBeTruthy();
  expect(
    password,
    'E2E demo password must be supplied by the runner',
  ).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto('/scenarios');
  const sample = page
    .locator('article')
    .filter({ hasText: 'Bulk export from an unfamiliar device' });
  await sample.getByRole('button', { name: 'Use sample' }).click();
  await page
    .getByRole('checkbox', {
      name: 'I confirm both files contain synthetic employee and event data only.',
    })
    .check();
  await page.getByRole('button', { name: 'Import and run evaluation' }).click();

  await page.waitForFunction(
    () => {
      const panel = document.querySelector('.dataset-import');
      return Boolean(
        panel?.querySelector('.import-state-error') ||
        panel?.textContent?.includes('Evaluation run completed'),
      );
    },
    undefined,
    { timeout: 180_000 },
  );
  const importState = await page.locator('.dataset-import').innerText();
  console.log(`[e2e] Dataset import state:\n${importState}`);
  expect(importState).toContain('Evaluation run completed');
  await expect(
    page.getByText(/Synthetic development result only/),
  ).toBeVisible();

  await page.goto('/overview');
  await expect(page.getByText('Synthetic development results')).toBeVisible();
  await expect(page.getByText('Employee-days evaluated')).toBeVisible();

  await page.goto('/evaluation');
  await expect(
    page.getByRole('heading', { name: 'Model evaluation' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View run' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Confusion counts' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Per-scenario metrics' }),
  ).toBeVisible();
  await expect(
    page.getByText('Development experiment on synthetic data only.'),
  ).toBeVisible();

  await page.goto('/investigations');
  await expect(
    page.getByRole('heading', { name: 'Findings from evaluation runs' }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'emp-access-demo' }).first(),
  ).toBeVisible({ timeout: 30_000 });
});
