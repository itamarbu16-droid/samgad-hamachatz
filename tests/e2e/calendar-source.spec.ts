import {expect,test} from '@playwright/test';
import {signInThroughForm} from './login';

test('calendar source can be recovered when the previous calendar is unavailable',async({page})=>{
 await signInThroughForm(page);
 let selected='old-calendar';
 await page.route('**/api/calendar',route=>route.fulfill({json:{configured:true,connected:true,invitees:[]}}));
 await page.route('**/api/calendar/agenda',route=>selected==='old-calendar'
  ?route.fulfill({status:409,json:{error:'היומן הקודם אינו זמין'}})
  :route.fulfill({json:{connected:true,events:[]}}));
 await page.route('**/api/calendar/source',async route=>{
  if(route.request().method()==='PUT'){selected=route.request().postDataJSON().calendarId;await route.fulfill({json:{saved:true}});return;}
  await route.fulfill({json:{selected,calendars:[{id:'battalion',name:'לו״ז סמג״ד',canWrite:true},{id:'read-only',name:'לצפייה',canWrite:false}]}});
 });
 await page.goto('/?view=calendar');
 await expect(page.getByRole('alert').filter({hasText:'היומן הקודם אינו זמין'})).toBeVisible();
 const source=page.getByLabel('יומן הלו״ז',{exact:true});
 await expect(source).toBeVisible();
 await source.selectOption('battalion');
 expect(selected).toBe('old-calendar'); // Changing the picker alone must not change the saved source.
 await page.getByRole('button',{name:'שמור את בחירת היומן'}).click();
 await expect(page.getByText('אין אירועים להצגה בטווח הזה.')).toBeVisible();
 await expect(source).toHaveValue('battalion');
 expect(selected).toBe('battalion');
 await expect(page.getByRole('link',{name:'חיבור מחדש ל־Google',exact:true})).toBeVisible();
});
