import { expect, test, type Page, type TestInfo } from "@playwright/test";

test.use({ serviceWorkers: "block", reducedMotion: "reduce", hasTouch: true, isMobile: true });

const localHost = new Set(["localhost", "127.0.0.1", "[::1]"]);
const date = new Intl.DateTimeFormat("en-CA", {year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Jerusalem"}).format(new Date());
const plusDays = (value: string, n: number) => {
  const day = new Date(value + "T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + n);
  return day.toISOString().slice(0, 10);
};

async function fixture(page: Page, info: TestInfo, editor: boolean) {
  const base = info.project.use.baseURL;
  test.skip(!base || !localHost.has(new URL(base).hostname), "Synthetic screenshot checks run exclusively against localhost");
  const baseOrigin = new URL(base!).origin;
  const user = { id:"fixture-user", organizationId:"fixture-space", workspaceOwnerId:"fixture-owner", name:"משתמש לדוגמה", role:editor?"deputy":"viewer",
    permissions:{editAll:editor,manageAccess:editor,guest:false} };
  const docs = {
    folders:[
      {id:"reference",name:"חומרי עזר",section:"library",parent:null},
      {id:"general",name:"כללי",section:"library",parent:"reference",custom:true},
      {id:"reference-archive",name:"הדרכה",section:"library",parent:"general",custom:true},
      {id:"trackers",name:"מעקבים",section:"library",parent:null},
      {id:"meetings",name:"סיכומי ישיבות",section:"records",parent:null},
    ],
    entries:[{id:"file",title:"מדריך לדוגמה",folderId:"reference-archive",preview:"טקסט לדוגמה",body:"טקסט לדוגמה",creatorId:"fixture-user",documentDate:null,version:1,updatedAt:date,attachments:[]}],
  };
  const task = { id:"fixture-task", title:"ריכוז הערות לקראת פגישה", description:"תוכן הדגמה", ownerId:"other-user",creatorId:"fixture-user",domainId:"general",companyId:null,priority:"normal",status:"open",dueDate:plusDays(date,2),createdAt:date,updatedAt:date,version:1,requiresReview:false,blockerReason:null,comments:[] };
  let refusedWrites = 0;
  await page.context().route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== baseOrigin) { await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    if (request.method() !== "GET") { refusedWrites++; await route.fulfill({status:405,json:{error:"fixture: read only"}}); return; }
    const data: Record<string, unknown> = {
      "/api/workspace":{user,pinnedTaskKeys:[],tasks:editor?[task]:[],domains:[{id:"general",name:"כללי",color:"#ff963f"}],users:[user,{id:"other-user",name:"אדם לדוגמה",role:"staff"}],companies:[],activity:[],decisions:[],demo:true,today:date,rhythmDueReminder:[]},
      "/api/rhythm":{items:[],occurrences:[],groups:[],today:date,month:date.slice(0,7),people:[]},
      "/api/documents":docs,
      "/api/documents/file":{entry:docs.entries[0]},
      "/api/deadline-requests":[],
      "/api/calendar/source":{selected:"fixture",calendars:[{id:"fixture",name:"יומן לדוגמה",canWrite:true}]},
      "/api/calendar/agenda":{connected:true,events:[{id:"event",title:"פגישת דוגמה",start:date,end:plusDays(date,1),allDay:true}]},
      "/api/calendar":{configured:true,connected:true,invitees:[]},
    };
    await route.fulfill({status:url.pathname in data?200:404,json:data[url.pathname]??{error:"fixture endpoint unavailable"}});
  });
  return () => expect(refusedWrites).toBe(0);
}

async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.UX_CAPTURE_SCREENSHOTS === "1") await page.screenshot({path:info.outputPath(name+".png"),animations:"disabled"});
}
async function fit(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("dir","rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("manager mobile home: one quick add, grouped More, and RTL nested folder actions", async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  const readOnly = await fixture(page,info,true);
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"סמג״ד המחץ",exact:true})).toBeVisible();
  await fit(page);
  const add = page.getByRole("button",{name:"הוספה מהירה",exact:true});
  await expect(add).toHaveCount(1);
  await expect(page.locator(".capture-button")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"תמונת מצב גדודית"})).toBeInViewport();
  await capture(page,info,"manager-home-390");
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog",{name:"הוספה מהירה"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  const mobile = page.getByRole("navigation",{name:"ניווט ראשי",exact:true});
  await expect(mobile.getByRole("button",{name:"ראשי",exact:true})).toHaveAttribute("aria-current","page");
  const more = mobile.getByRole("button",{name:"עוד",exact:true});
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog",{name:"עוד",exact:true});
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button",{name:"ספרייה",exact:true})).toHaveCount(0);
  await expect(menu.getByRole("button",{name:"ניהול גישה",exact:true})).toBeVisible();
  await capture(page,info,"manager-more-390");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await mobile.getByRole("button",{name:"ספרייה",exact:true}).tap();
  await expect(page.getByRole("heading",{name:"ספרייה",exact:true})).toBeVisible();
  await expect(mobile.getByRole("button",{name:"ספרייה",exact:true})).toHaveAttribute("aria-current","page");
  for (const name of ["חומרי עזר","כללי","הדרכה"]) await page.locator(".document-folder-card").filter({hasText:name}).tap();
  const trail = page.getByRole("navigation",{name:"מיקום בספריית המסמכים"});
  await expect(trail.locator("[aria-current=page]")).toHaveText("הדרכה");
  await expect(trail.getByRole("button",{name:"חומרי עזר",exact:true})).toBeVisible();
  await capture(page,info,"library-nested-390");
  await page.getByRole("button",{name:/אפשרויות.*מדריך לדוגמה/}).tap();
  await expect(page.getByRole("dialog").getByRole("button",{name:/העברה|העבר/})).toBeVisible();
  await page.keyboard.press("Escape");
  await trail.getByRole("button",{name:"חומרי עזר",exact:true}).tap();
  await expect(trail.locator("[aria-current=page]")).toHaveText("חומרי עזר");
  readOnly();
});

test("viewer at 320px keeps short-tap/read access without editing controls", async ({page}, info) => {
  await page.setViewportSize({width:320,height:568});
  const readOnly = await fixture(page,info,false);
  await page.goto("/deputies");
  await expect(page.getByRole("heading",{name:"סגני המחץ",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"הוספה מהירה",exact:true})).toHaveCount(0);
  await fit(page);
  await capture(page,info,"reader-home-320");
  const mobile = page.getByRole("navigation",{name:"ניווט ראשי",exact:true});
  await mobile.getByRole("button",{name:"עוד",exact:true}).tap();
  const more = page.getByRole("dialog",{name:"עוד",exact:true});
  await expect(more.getByRole("button",{name:"ניהול גישה",exact:true})).toHaveCount(0);
  await expect(more.getByRole("button",{name:"אישי",exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");
  await mobile.getByRole("button",{name:"ספרייה",exact:true}).tap();
  for (const name of ["חומרי עזר","כללי","הדרכה"]) await page.locator(".document-folder-card").filter({hasText:name}).tap();
  await expect(page.getByRole("button",{name:"הוספת מסמך / קובץ",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:/אפשרויות.*מדריך לדוגמה/})).toHaveCount(0);
  await page.getByRole("button",{name:/מדריך לדוגמה/}).tap();
  await expect(page.getByRole("dialog",{name:"מדריך לדוגמה"})).toBeVisible();
  await fit(page);
  readOnly();
});

for (const size of [{width:500,height:739},{width:390,height:844},{width:320,height:568}]) {
  test(`calendar day and week controls stay tappable at ${size.width}px`, async ({page},info) => {
    await page.setViewportSize(size);
    const readOnly = await fixture(page,info,true);
    await page.goto("/?view=calendar");
    await expect(page.locator(".capture-button")).toHaveCount(0);
    const input=page.getByLabel("בחירת תאריך");
    const previous=await input.inputValue();
    await fit(page);
    const next=page.getByRole("button",{name:"היום הבא",exact:true});
    await next.tap();
    await expect(input).toHaveValue(plusDays(previous,1));
    await page.getByRole("button",{name:"שבועית",exact:true}).tap();
    await expect(page.getByRole("button",{name:"שבועית",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.getByRole("button",{name:"השבוע הבא",exact:true}).tap();
    await expect(input).toHaveValue(plusDays(previous,8));
    if(size.width===500)await capture(page,info,"calendar-week-500");
    readOnly();
  });
}
