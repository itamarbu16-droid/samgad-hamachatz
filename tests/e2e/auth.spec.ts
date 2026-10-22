import { expect, test } from '@playwright/test';
import { signInThroughForm } from './login';

test('anonymous visitors cannot read the workspace', async ({ request }) => {
  expect((await request.get('/api/workspace')).status()).toBe(401);
  expect((await request.get('/api/rhythm')).status()).toBe(401);
  expect((await request.get('/api/documents')).status()).toBe(401);
});

test('Hebrew login form signs a synthetic user into a persisted session', async ({ page }) => {
  await signInThroughForm(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get('/api/workspace')).status()).toBe(200);
  await page.reload();
  expect((await page.request.get('/api/workspace')).status()).toBe(200);
});
