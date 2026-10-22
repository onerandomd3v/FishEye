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
      name: 'I confirm both files contain fictional people and activity only.',
    })
    .check();
  await page.getByRole('button', { name: 'Run evaluation' }).click();

  try {
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('.dataset-import');
        return Boolean(
          panel?.querySelector('.import-state-error') ||
          panel?.textContent?.includes('Evaluation complete'),
        );
      },
      undefined,
      { timeout: 180_000 },
    );
  } catch (error) {
    const panelText = await page.locator('.dataset-import').innerText();
    console.log(`[e2e] Dataset import state at timeout: ${panelText}`);
    throw error;
  }
  const importState = await page.locator('.dataset-import').innerText();
  console.log(`[e2e] Dataset import state:\n${importState}`);
  expect(importState).toContain('Evaluation complete');
  await expect(page.getByText('Results on the evaluation data')).toBeVisible();

  await page.goto('/overview');
  await expect(
    page.getByRole('heading', { name: 'Latest findings' }),
  ).toBeVisible();
  await expect(page.getByText('Person-days evaluated')).toBeVisible();

  await page.goto('/evaluation');
  await expect(page.getByRole('heading', { name: 'Evaluation' })).toBeVisible();
  await page
    .getByRole('link', { name: /View run/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Compare methods' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Findings' })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'Score cutoff' }),
  ).toBeVisible();

  await page.goto('/investigations');
  await expect(
    page.getByRole('heading', { name: 'Investigations' }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'emp-access-demo' }).first(),
  ).toBeVisible({ timeout: 30_000 });
});
