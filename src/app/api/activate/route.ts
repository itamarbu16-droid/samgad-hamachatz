import {AppError} from '@/server/policy';
import {appUrl} from '@/server/app-url';
import {readBody} from '@/server/http';
import {activateOwner} from '@/server/activate-owner';
import {ZodError} from 'zod';
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==appUrl())throw new AppError(403,'מקור הבקשה אינו מאושר');
  if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError(415,'פורמט הבקשה אינו נתמך');
  return Response.json(await activateOwner(await readBody(request,2048)),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  if(error instanceof AppError)return Response.json({error:error.message},{status:error.status});
  if(error instanceof ZodError)return Response.json({error:'יש לבחור סיסמה בת 12 תווים לפחות'},{status:422});
  return Response.json({error:'ההפעלה אינה זמינה כרגע. ייתכן שהמרחב עדיין ממתין לחיבור מסד הנתונים.'},{status:503});
 }
}
