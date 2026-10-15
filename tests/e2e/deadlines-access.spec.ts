import {expect,test} from '@playwright/test';
import {signInThroughForm,retryDelay} from './login';
const offset=(date:string,n:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
test('deadline colors, descending default sorting and seven separated rhythm frequencies',async({page},testInfo)=>{
 await signInThroughForm(page);const origin=new URL(page.url()).origin;
 const ws=await (await page.request.get('/api/workspace')).json();const prefix=`deadline-ui-${Date.now()}`;
 const create=async(extra:object)=>{const r=await page.request.post('/api/rhythm/items',{headers:{Origin:origin},data:{clientRequestId:crypto.randomUUID(),title:prefix,...extra}});expect(r.ok()).toBe(true);return (await r.json()).item;};
 await create({title:prefix+' overdue',startDate:offset(ws.today,-1)});
 await create({title:prefix+' tomorrow',startDate:offset(ws.today,1)});
 await create({title:prefix+' future',startDate:offset(ws.today,9)});
 const completed=await create({title:prefix+' green',startDate:offset(ws.today,-3)});
 const rhythm=await (await page.request.get('/api/rhythm')).json();const row=rhythm.occurrences.find((r:{itemId:string})=>r.itemId===completed.id);
 expect((await page.request.patch(`/api/rhythm/occurrences/${row.id}`,{headers:{Origin:origin},data:{version:row.version,done:true}})).ok()).toBe(true);
 await create({title:prefix+' daily',frequency:'daily',startDate:ws.today,endDate:ws.today});
 await page.goto('/?view=personal');await page.getByLabel('סינון',{exact:true}).selectOption('all');
 const table=page.locator('.rhythm-table');
 await expect(table.locator('tr').filter({hasText:prefix+' overdue'})).toHaveClass(/task-overdue/);
 await expect(table.locator('tr').filter({hasText:prefix+' tomorrow'})).toHaveClass(/task-due-soon/);
 await expect(table.locator('tr').filter({hasText:prefix+' green'})).toHaveClass(/task-done/);
 expect((await table.locator('tbody tr').filter({hasText:prefix}).allTextContents())[0]).toContain('future');
 await expect(table).not.toContainText(prefix+' daily');
 await page.getByLabel('מיון משימות',{exact:true}).selectOption('deadline_asc');
 expect((await table.locator('tbody tr').filter({hasText:prefix}).allTextContents())[0]).toContain('green');
 await page.screenshot({path:`test-results/task-colors-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'שעל״ח — שעון לחימה',exact:true}).click();
 const frequencies=page.getByRole('group',{name:'תדירות שעל״ח'});
 for(const name of ['יומי','שבועי','דו שבועי','חודשי','פעם ברבעון','פעם בחצי שנה','פעם בשנה'])await expect(frequencies.getByRole('button',{name,exact:true})).toBeVisible();
 await frequencies.getByRole('button',{name:'יומי',exact:true}).click();await expect(table).toContainText(prefix+' daily');await expect(table).not.toContainText(prefix+' future');
 await page.screenshot({path:`test-results/deadlines-${testInfo.project.name}.png`,fullPage:true});
});
test('owner grants an email global editing while guests and editors cannot see owner private content',async({page,browser},testInfo)=>{
 await signInThroughForm(page);const origin=new URL(page.url()).origin;const ws=await (await page.request.get('/api/workspace')).json();const secret=`owner-private-${Date.now()}`;
 const saved=await page.request.post('/api/rhythm/items',{headers:{Origin:origin},data:{clientRequestId:crypto.randomUUID(),title:secret,category:'point'}});expect(saved.ok()).toBe(true);
 await page.getByRole('button',{name:'ניהול הרשאות',exact:true}).click();await expect(page.getByRole('heading',{name:'ניהול גישה לפי מייל'})).toBeVisible();
 const email=`editor-ui-${Date.now()}@samgad.example`,password='initial-ui-password-12345';
 const form=page.locator('.access-form');await form.getByLabel('מייל',{exact:true}).fill(email);await form.getByLabel('שם / בעל תפקיד — רשות',{exact:true}).fill('עורך בדיקה');await form.getByRole('combobox',{name:'הרשאה',exact:true}).selectOption('all');await form.getByLabel('סיסמה ראשונית — לחשבון חדש בלבד',{exact:true}).fill(password);await form.getByRole('button',{name:'שמירת הרשאה'}).click();await expect(page.locator('.access-members')).toContainText(email);
 const guest=await browser.newContext();try{
  const r=await guest.request.get(origin+'/api/rhythm');expect(r.status()).toBe(401);expect(JSON.stringify(await r.json())).not.toContain(secret);
  const p=await guest.newPage();await p.goto(origin+'/deputies');await expect(p).toHaveURL(/\/deputies\/login$/);await expect(p.getByRole('heading',{name:'סגני המחץ',exact:true})).toBeVisible();await expect(p.locator('nav').getByRole('button',{name:'אישי',exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'הוספה מהירה'})).toHaveCount(0);
  expect((await guest.request.post(origin+'/api/tasks',{headers:{Origin:origin},data:{title:'forbidden'}})).status()).toBe(401);
 }finally{await guest.close();}
 const editor=await browser.newContext();try{
  for(let attempt=0;attempt<4;attempt++){
   const login=await editor.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
   if(login.status()===429 && attempt<3){await new Promise(resolve=>setTimeout(resolve,retryDelay(login.headers()['retry-after'])));continue;}
   expect(login.status()).toBe(200);break;
  }
  const data=await (await editor.request.get(origin+'/api/workspace')).json();expect(data.user.permissions.editAll).toBe(true);expect(data.user.permissions.manageAccess).toBe(false);
  expect(JSON.stringify(await (await editor.request.get(origin+'/api/rhythm')).json())).not.toContain(secret);
  const otherOwner=ws.users.find((u:{id:string;role:string})=>u.id!==ws.user.id&&!['viewer','admin'].includes(u.role));
  const r=await page.request.post('/api/tasks',{headers:{Origin:origin},data:{title:'global-editor-test',ownerId:otherOwner.id,domainId:'logistics',companyId:otherOwner.companyId||null}});expect(r.ok()).toBe(true);const task=(await r.json()).task;
  expect((await editor.request.patch(origin+`/api/tasks/${task.id}`,{headers:{Origin:origin},data:{version:1,title:'edited by email permission'}})).ok()).toBe(true);
  const p=await editor.newPage();await p.goto(origin+'/deputies');await expect(p.getByRole('heading',{name:'סגני המחץ',exact:true})).toBeVisible();await expect(p.getByText('מנהל המערכת',{exact:true})).toHaveCount(0);await expect(p.getByRole('button',{name:'ניהול הרשאות',exact:true})).toHaveCount(0);await expect(p.locator('nav').getByRole('button',{name:'אישי',exact:true})).toHaveCount(0);
 }finally{await editor.close();await page.request.post('/api/access',{headers:{Origin:origin},data:{email,level:'revoke'}});}
 await page.screenshot({path:`test-results/access-${testInfo.project.name}.png`,fullPage:true});
});
