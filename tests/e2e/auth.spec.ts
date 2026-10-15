import { expect, test } from '@playwright/test';
import { signInThroughForm } from './login';

test('anonymous visitors receive a read-only shared workspace', async ({ request }) => {
  const response = await request.get('/api/workspace');
  expect(response.status()).toBe(200);
  const data=await response.json();expect(data.user.permissions.guest).toBe(true);expect(data.user.role).toBe('viewer');
  expect(data.tasks.every((t:{creatorId:string;ownerId:string})=>t.creatorId!==t.ownerId)).toBe(true);
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
