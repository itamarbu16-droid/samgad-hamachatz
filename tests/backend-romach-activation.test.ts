import {beforeAll,afterAll,it,expect} from 'vitest';
import {connection,closeDb,getDb} from '../src/server/db';
import {activateOwner} from '../src/server/activate-owner';
import {principalFor,getWorkspace} from '../src/server/service';
import * as s from '../src/server/schema';
beforeAll(async()=>{
 process.env.DEMO_MODE='true';process.env.PGLITE_DATA_DIR='memory://';delete process.env.DATABASE_URL;delete process.env.VERCEL;
 process.env.BETTER_AUTH_URL='http://localhost:3000';process.env.BETTER_AUTH_SECRET='romach-isolated-test-secret-at-least-32-chars';
 process.env.OWNER_ACTIVATION_TOKEN='romach-activation-test-token-at-least-32-chars';process.env.WORKSPACE_OWNER_EMAIL='owner@romach.example';process.env.WORKSPACE_ORGANIZATION_ID='romach-75';
 await (await connection()).migrate();
},60000);
afterAll(closeDb);
it('rejects invalid activation without creating accounts',async()=>{
 await expect(activateOwner({token:'wrong-token-that-is-at-least-32-characters',password:'test-password-12345'})).rejects.toMatchObject({status:403});
 expect(await (await getDb()).select().from(s.user)).toHaveLength(0);
});
it('creates only the configured owner as the owner of a clean independent workspace and prevents reuse',async()=>{
 const input={token:process.env.OWNER_ACTIVATION_TOKEN,password:'romach-test-password-12345'};
 await expect(activateOwner(input)).resolves.toEqual({activated:true,email:'owner@romach.example'});
 const db=await getDb(),users=await db.select().from(s.user);expect(users).toHaveLength(1);expect(users[0].email).toBe('owner@romach.example');
 const p=await principalFor(users[0].id,users[0].name);expect(p.organizationId).toBe('romach-75');expect(p.manageAccess).toBe(true);
 const workspace=await getWorkspace(p);expect(workspace.tasks).toEqual([]);expect(workspace.activity).toEqual([]);expect(workspace.users).toHaveLength(1);
 expect((await db.select().from(s.workspaceSettings))[0].publicRead).toBe(false);
 await expect(activateOwner(input)).rejects.toMatchObject({status:409});
});
