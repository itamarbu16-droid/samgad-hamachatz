import { getAuth } from '@/server/auth';
import { assertEmailAccess } from '@/server/access';
import { AppError } from '@/server/policy';
export const runtime='nodejs';
async function handle(request:Request) {
 try {
  if(request.method==='POST' && new URL(request.url).pathname.endsWith('/sign-in/email')) {
   const body=await request.clone().json().catch(()=>null);
   if(typeof body?.email==='string')await assertEmailAccess(body.email);
  }
  const auth=await getAuth();return await auth.handler(request);
 }catch(error){
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  return Response.json({error:'שירות ההתחברות אינו זמין. יש לבדוק את הגדרות הסביבה'},{status:503});
 }
}
export {handle as GET,handle as POST};
