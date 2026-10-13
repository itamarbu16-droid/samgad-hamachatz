import { expect, test, request, type APIRequestContext } from '@playwright/test';
import { retryDelay } from './login';

async function session(baseURL: string, email: string) {
  test.setTimeout(240_000);
  if (!process.env.DEMO_PASSWORD) throw new Error('DEMO_PASSWORD is required for authorization fixtures.');
  const context = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin } });
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await context.post('/api/auth/sign-in/email', { data: { email, password: process.env.DEMO_PASSWORD } });
    if (result.status() === 429 && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, retryDelay(result.headers()['retry-after'])));
      continue;
    }
    if (result.status() !== 200) await context.dispose();
    expect(result.status(), `Synthetic fixture sign-in failed for ${email}`).toBe(200);
    break;
  }
  return context;
}

test('company scope protects records and writes independently of the UI', async ({ baseURL }) => {
  expect(baseURL).toBeTruthy();
  let scoped: APIRequestContext | undefined;
  try {
    scoped = await session(baseURL!, 'company.a@samgad.example');
    const response = await scoped.get('/api/workspace');
    expect(response.status()).toBe(200);
    const workspace = await response.json();
    expect(workspace.tasks.length).toBeGreaterThan(0);
    expect(workspace.tasks.every((task: { companyId: string }) => task.companyId === 'company-a')).toBe(true);
    expect(workspace.tasks.some((task: { id: string }) => task.id === 'demo-task-3')).toBe(false);
    expect(workspace.activity.some((event: { entityId: string }) => event.entityId === 'demo-task-3')).toBe(false);
    const denied = await scoped.patch('/api/tasks/demo-task-3', { data: { version: 1, status: 'in_progress' } });
    expect(denied.status()).toBe(404);
    const invalidScope = await scoped.post('/api/tasks', { data: { title: 'בדיקת תחום אסור', ownerId: workspace.user.id, domainId: 'safety', companyId: 'company-b' } });
    expect(invalidScope.status()).toBe(403);
  } finally {
    await scoped?.dispose();
  }
});

test('read-only users cannot create tasks or mutate visible records', async ({ baseURL }) => {
  let viewer: APIRequestContext | undefined;
  try {
    viewer = await session(baseURL!, 'viewer@samgad.example');
    const response = await viewer.get('/api/workspace');
    expect(response.status()).toBe(200);
    const workspace = await response.json();
    const task = workspace.tasks.find((item: { id: string }) => item.id === 'demo-task-1');
    expect(task).toBeTruthy();
    expect((await viewer.patch(`/api/tasks/${task.id}`, { data: { version: task.version, status: 'in_progress' } })).status()).toBe(403);
    expect((await viewer.post('/api/tasks', { data: { title: 'בדיקת כתיבה אסורה', ownerId: workspace.user.id, domainId: 'safety' } })).status()).toBe(403);
  } finally {
    await viewer?.dispose();
  }
});

test('authenticated mutations reject an untrusted origin', async ({ baseURL }) => {
  let manager: APIRequestContext | undefined;
  try {
    manager = await session(baseURL!, process.env.DEMO_EMAIL ?? 'demo@samgad.example');
    const response = await manager.post('/api/tasks', { headers: { Origin: 'https://untrusted.invalid' }, data: { title: 'פעולה שלא צריכה להתבצע' } });
    expect(response.status()).toBe(403);
  } finally {
    await manager?.dispose();
  }
});

