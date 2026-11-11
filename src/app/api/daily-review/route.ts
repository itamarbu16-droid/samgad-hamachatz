import {dailyReview} from '@/server/daily-review';
import {AppError} from '@/server/policy';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
 try{return Response.json(await dailyReview(request),{headers});}
 catch(error){return Response.json({error:error instanceof AppError?error.message:'לא ניתן לבדוק את המשימות כרגע. אין להסיק שאין משימות פתוחות'},{status:error instanceof AppError?error.status:503,headers});}
}
