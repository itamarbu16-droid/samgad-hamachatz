import { getAuth } from '@/server/auth';
export const runtime='nodejs';
async function handle(request:Request) { try { const auth=await getAuth(); return await auth.handler(request); } catch { return Response.json({error:'שירות ההתחברות אינו זמין. יש לבדוק את הגדרות הסביבה'},{status:503}); } }
export {handle as GET,handle as POST};
