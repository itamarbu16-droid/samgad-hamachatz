import {afterEach,expect,it,vi} from 'vitest';
import {assertManualDeviceContext,manualDeviceContext,manualDeviceContextHeader} from '../src/server/manual-device-context';
import type {Principal} from '../src/server/policy';

const p:Principal={userId:'test-member',organizationId:'test-org',role:'contributor',name:'Synthetic',companyId:null,domainId:null};
const origin='https://manual-test.example';
afterEach(()=>vi.unstubAllEnvs());
function req(token?:string) {
 return new Request(origin+'/api/push/manual-device',{method:'POST',headers:token?{[manualDeviceContextHeader]:token}:{}});
}
it('the challenge is opaque and stable for exactly the same authenticated session',()=>{
 vi.stubEnv('BETTER_AUTH_SECRET','only-a-synthetic-session-signing-secret-for-tests');
 const token=manualDeviceContext(p,'private-synthetic-session-id',origin);
 expect(token).toMatch(/^[0-9A-Za-z_-]{43}$/);
 expect(token).not.toContain(p.userId);
 expect(token).not.toContain('private-synthetic-session-id');
 expect(()=>assertManualDeviceContext(req(token),p,'private-synthetic-session-id',origin)).not.toThrow();
 for(const input of [undefined,'short',token.slice(0,-1)+(token.at(-1)==='Z'?'Y':'Z')])
  expect(()=>assertManualDeviceContext(req(input),p,'private-synthetic-session-id',origin)).toThrow(/החשבון או ההתחברות השתנו/);
});
it('changing account, organization, session or canonical origin invalidates the challenge',()=>{
 vi.stubEnv('BETTER_AUTH_SECRET','only-a-synthetic-session-signing-secret-for-tests');
 const r=req(manualDeviceContext(p,'first-session',origin));
 const cases:[Principal,string,string][]=[[{...p,userId:'new-account'},'first-session',origin],[{...p,organizationId:'new-org'},'first-session',origin],
 [p,'renewed-session',origin],[p,'first-session','https://different-app.example']];
 for(const values of cases)expect(()=>assertManualDeviceContext(r,...values)).toThrow(/החשבון או ההתחברות השתנו/);
});
