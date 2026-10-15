import { expect, test, type Page } from "@playwright/test";
import { signInThroughForm } from "./login";

async function signIn(page: Page) {
  await signInThroughForm(page);
  await expect(
    page.getByRole("heading", { name: "הכול ברור. מכאן מתקדמים." }),
  ).toBeVisible();
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("create with only a title and complete a private task with persisted status", async ({
  page,
}) => {
  const workspace = await signIn(page);
  const title = `בדיקה אישית ${Date.now()}`;
  await page.goto("/?view=personal");
  const openCount = page
    .locator(".rhythm-summary > span")
    .first()
    .locator("strong");
  await expect(openCount).toBeVisible();
  const before = Number(await openCount.innerText());
  await page.getByRole("button", { name: "הוספת משימה", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "משימה", exact: true });
  await dialog.getByLabel("שם המשימה").fill(title);
  await expect(dialog.getByLabel("מועד סיום — רשות")).toHaveValue("");
  await expect(dialog.getByLabel("שיוך לפי מיילים (רשות)")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "שמירת המשימה", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(openCount).toHaveText(String(before + 1));
  await page.getByLabel("סינון", { exact: true }).selectOption("all");
  const row = page.locator(".rhythm-table tbody tr").filter({ hasText: title });
  await expect(row).toContainText("פרטי");
  await expect(row).toContainText("ללא מועד");
  await row.getByRole("button", {name: /^בוצע:/}).click();
  await expect(row).toContainText("בוצע");
  await expect(openCount).toHaveText(String(before));
  await page.reload();
  await page.getByLabel("סינון", { exact: true }).selectOption("all");
  await expect(row).toContainText("בוצע");
  const persisted = await (await page.request.get("/api/rhythm")).json();
  const task = persisted.items.find(
    (item: { title: string }) => item.title === title,
  );
  expect(task.assigneeIds).toEqual([workspace.user.id]);
  expect(
    persisted.occurrences.find(
      (item: { itemId: string }) => item.itemId === task.id,
    ).done,
  ).toBe(true);
});

test("submit and resolve a decision through the actual UI", async ({
  page,
}) => {
  const workspace = await signIn(page);
  const title = `בקשת החלטה לבדיקה ${Date.now()}`;
  await page.goto("/?view=decisions");
  await page.getByRole("button", { name: "בקשה להחלטה", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "בקשה להחלטה" });
  await dialog.getByLabel("נושא ההחלטה").fill(title);
  await dialog
    .getByLabel("תיאור", { exact: true })
    .fill("אישור תהליך מנהלתי סינתטי בלבד.");
  await dialog
    .getByRole("combobox", { name: "מחליט", exact: true })
    .selectOption(workspace.user.id);
  await dialog.getByLabel("תחום אחריות").selectOption(workspace.domains[0].id);
  await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
  await expect(dialog).not.toBeVisible();
  const card = page
    .locator(".decision-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card
    .getByLabel("הערות להחלטה")
    .fill("אושר לצורך אימות התהליך הסינתטי.");
  await card
    .getByRole("combobox", { name: "החלטה", exact: true })
    .selectOption("approved");
  await card.getByRole("button", { name: "שמירת החלטה" }).click();
  await expect(card.locator(".badge")).toHaveText("אושרה");
  await page.reload();
  await expect(card.locator(".decision-notes")).toContainText(
    "אושר לצורך אימות התהליך הסינתטי.",
  );
  const persisted = await (await page.request.get("/api/workspace")).json();
  const decision = persisted.decisions.find(
    (item: { title: string }) => item.title === title,
  );
  expect(decision.status).toBe("approved");
  expect(decision.resolvedAt).toBeTruthy();
  expect(
    persisted.activity.some(
      (item: { entityId: string }) => item.entityId === decision.id,
    ),
  ).toBeTruthy();
});

test("dashboard is RTL and fits the viewport", async ({ page }, testInfo) => {
  await signIn(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "יצירת משימה", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("library folder navigation, text/file upload and download persist across reload", async ({
  page,
}) => {
  await signIn(page);
  const title = `סיכום ועדה סינתטי ${Date.now()}`;
  await page.goto("/?view=records");
  await page.locator(".document-folder-card").filter({ hasText: "סיכומי ישיבות" }).click();
  await page.getByRole("button", { name: /ועדת בטיחות/ }).click();
  await page.getByRole("button", { name: "הוספת סיכום", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "הוספת סיכום ישיבה / ביקורת",
  });
  await dialog.getByLabel("כותרת", { exact: true }).fill(title);
  await dialog.getByLabel("טקסט / סיכום").fill("סיכום סינתטי לבדיקה בלבד");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: "summary.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("synthetic attachment"),
    });
  await dialog.getByRole("button", { name: "שמירה בתיקייה" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button")
    .filter({ has: page.getByText(title, { exact: true }) })
    .click();
  const detail = page.getByRole("dialog", { name: title, exact: true });
  await expect(detail).toContainText("סיכום סינתטי לבדיקה בלבד");
  const download = page.waitForEvent("download");
  await detail.getByRole("link", { name: /summary.txt/ }).click();
  expect((await download).suggestedFilename()).toBe("summary.txt");
  await page.reload();
  const persisted = await (await page.request.get("/api/documents")).json();
  expect(
    persisted.entries.find((entry: { title: string }) => entry.title === title)
      .attachments,
  ).toHaveLength(1);
});
