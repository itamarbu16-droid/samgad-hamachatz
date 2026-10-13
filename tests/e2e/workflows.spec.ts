import { expect, test, type Page } from '@playwright/test';
import { signInThroughForm } from './login';

async function signIn(page: Page) {
  await signInThroughForm(page);
  await expect(page.getByRole('heading', { name: 'הכול ברור. מכאן מתקדמים.' })).toBeVisible();
  const response = await page.request.get('/api/workspace');
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('create, reload, progress, and complete a task with reconciled dashboard counts', async ({ page }) => {
  const workspace = await signIn(page);
  const title = `בדיקת תהליך מנהלתי ${Date.now()}`;
  const overdueMetric = page.getByRole('button').filter({ hasText: 'משימות באיחור' });
  const initialLate = Number(await overdueMetric.locator('strong').innerText());
  await page.getByRole('button', { name: 'יצירת משימה', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'יצירת משימה' });
  await create.getByLabel('כותרת המשימה').fill(title);
  await create.getByLabel('אחראי לביצוע').selectOption(workspace.user.id);
  await create.getByLabel('תחום אחריות').selectOption('safety');
  await create.getByLabel('מועד סיום').fill('2000-01-01');
  await create.getByRole('button', { name: 'שמירת משימה', exact: true }).click();
  await expect(create).not.toBeVisible();
  await expect(overdueMetric.locator('strong')).toHaveText(String(initialLate + 1).padStart(2, '0'));
  await page.reload();
  await overdueMetric.click();
  await page.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).click();
  const detail = page.getByRole('dialog', { name: 'פרטי משימה' });
  await expect(detail.getByRole('heading', { name: title })).toBeVisible();
  await detail.getByRole('combobox', { name: 'סטטוס', exact: true }).selectOption('in_progress');
  await detail.getByRole('button', { name: 'שמירת שינויים', exact: true }).click();
  await expect(detail.locator('.detail-top')).toContainText('בטיפול');
  await detail.getByLabel('הוספת עדכון').fill('הפעולה בוצעה במידע סינתטי לצורך בדיקה.');
  await detail.getByRole('button', { name: 'פרסום עדכון' }).click();
  await expect(detail.locator('.comment')).toContainText('הפעולה בוצעה במידע סינתטי לצורך בדיקה.');
  await detail.getByRole('combobox', { name: 'סטטוס', exact: true }).selectOption('completed');
  await detail.getByRole('button', { name: 'שמירת שינויים', exact: true }).click();
  await expect(detail.locator('.detail-top')).toContainText('הושלמה');
  await page.reload();
  await expect(detail.locator('.detail-top')).toContainText('הושלמה');
  await detail.getByRole('button', { name: 'סגירה', exact: true }).click();
  await page.goto('/');
  await expect(overdueMetric.locator('strong')).toHaveText(String(initialLate).padStart(2, '0'));
  const persisted = await (await page.request.get('/api/workspace')).json();
  const task = persisted.tasks.find((item: { title: string }) => item.title === title);
  expect(task.status).toBe('completed');
  expect(task.completedAt).toBeTruthy();
  expect(persisted.activity.some((item: { entityId: string }) => item.entityId === task.id)).toBeTruthy();
});

test('submit and resolve a decision through the actual UI', async ({ page }) => {
  const workspace = await signIn(page);
  const title = `בקשת החלטה לבדיקה ${Date.now()}`;
  await page.goto('/?view=decisions');
  await page.getByRole('button', { name: 'בקשה להחלטה', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'בקשה להחלטה' });
  await dialog.getByLabel('נושא ההחלטה').fill(title);
  await dialog.getByLabel('תיאור', { exact: true }).fill('אישור תהליך מנהלתי סינתטי בלבד.');
  await dialog.getByRole('combobox', { name: 'מחליט', exact: true }).selectOption(workspace.user.id);
  await dialog.getByLabel('תחום אחריות').selectOption('safety');
  await dialog.getByRole('button', { name: 'שליחת בקשה' }).click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator('.decision-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await card.getByLabel('הערות להחלטה').fill('אושר לצורך אימות התהליך הסינתטי.');
  await card.getByRole('combobox', { name: 'החלטה', exact: true }).selectOption('approved');
  await card.getByRole('button', { name: 'שמירת החלטה' }).click();
  await expect(card.locator('.badge')).toHaveText('אושרה');
  await page.reload();
  await expect(card.locator('.decision-notes')).toContainText('אושר לצורך אימות התהליך הסינתטי.');
  const persisted = await (await page.request.get('/api/workspace')).json();
  const decision = persisted.decisions.find((item: { title: string }) => item.title === title);
  expect(decision.status).toBe('approved');
  expect(decision.resolvedAt).toBeTruthy();
  expect(persisted.activity.some((item: { entityId: string }) => item.entityId === decision.id)).toBeTruthy();
});

test('dashboard is RTL and fits the viewport', async ({ page }, testInfo) => {
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/dashboard-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'יצירת משימה', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

