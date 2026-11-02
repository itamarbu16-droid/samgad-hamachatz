import {expect,test} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {signInThroughForm} from './login';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=','base64');

test('single scanned image opens inside its document on the first click and still downloads',async({page})=>{
 await signInThroughForm(page);
 const title=`Synthetic scan ${randomUUID()}`;
 const create=await page.request.post('/api/documents',{headers:{origin:new URL(page.url()).origin},data:{clientRequestId:randomUUID(),folderId:'trackers',title,body:'',attachments:[{filename:'scan.png',contentBase64:png.toString('base64')}]}});
 expect(create.ok()).toBeTruthy();
 await page.goto('/?view=library');
 await page.locator('.document-folder-card').filter({hasText:'מעקבים'}).click();
 await page.getByRole('button').filter({has:page.getByText(title,{exact:true})}).click();
 const dialog=page.getByRole('dialog',{name:title,exact:true});
 const image=dialog.getByRole('img',{name:'scan.png'});
 await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(1);
 const source=await image.getAttribute('src');
 expect(source).toMatch(/^\/api\/documents\/files\/.+\?preview=1$/);
 const response=await page.request.get(source!);
 expect(response.status()).toBe(200);
 expect(response.headers()['content-disposition']).toMatch(/^inline;/);
 expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
 expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
 const download=page.waitForEvent('download');
 await dialog.getByRole('link',{name:/scan.png/}).click();
 expect((await download).suggestedFilename()).toBe('scan.png');
 await dialog.getByRole('button',{name:'סגירה',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await page.getByRole('button').filter({has:page.getByText(title,{exact:true})}).click();
 await expect(dialog.getByRole('img',{name:'scan.png'})).toBeVisible();
});
