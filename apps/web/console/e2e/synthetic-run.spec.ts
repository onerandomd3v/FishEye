import { expect, test } from '@playwright/test';

test('a bundled synthetic dataset runs through API, worker, storage, and console', async ({
  page,
}) => {
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

  await expect(page.getByText('Evaluation run completed')).toBeVisible({
    timeout: 180_000,
  });
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
