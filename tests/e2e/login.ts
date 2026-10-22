import { expect, test, type Page } from '@playwright/test';

// Exercise the real limiter without weakening application configuration. Previous
// interrupted runs can leave legitimate database-backed sign-in counters active.
export function retryDelay(header: string | undefined): number {
  const seconds = Number(header);
  const delay = header && Number.isFinite(seconds)
    ? seconds * 1000
    : header && Number.isFinite(Date.parse(header))
      ? Date.parse(header) - Date.now()
      : 15_000;
  if (delay > 60_000) throw new Error('Authentication Retry-After exceeds this test suite’s bounded retry window. Retry the suite later.');
  return Math.max(1000, delay) + 250;
}

export async function signInThroughForm(page: Page) {
  test.setTimeout(240_000);
  if (!process.env.DEMO_PASSWORD) throw new Error('DEMO_PASSWORD is required for the isolated seeded database.');
  await page.goto('/login');
  await page.getByRole('button', { name: 'כניסה למערכת', exact: true }).click();
  await page.getByLabel('אימייל', { exact: true }).fill(process.env.DEMO_EMAIL ?? 'demo@samgad.example');
  await page.getByLabel('סיסמה', { exact: true }).fill(process.env.DEMO_PASSWORD);
  for (let attempt = 0; attempt < 4; attempt++) {
    const pending = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-in/email') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'כניסה למערכת' }).click();
    const response = await pending;
    if (response.status() === 429 && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, retryDelay(response.headers()['retry-after'])));
      continue;
    }
    expect(response.status(), 'Actual login form must authenticate successfully').toBe(200);
    break;
  }
  await expect(page).toHaveURL(/\/$/);
}
