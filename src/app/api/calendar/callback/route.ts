import {api} from '@/server/http';
import {finishCalendarConnection} from '@/server/google-calendar';
import {AppError} from '@/server/policy';
import {appUrl} from '@/server/app-url';
export async function GET(request:Request){return api(request,async p=>{
 try{return await finishCalendarConnection(p,request);}
 catch(error){if(!(error instanceof AppError))throw error;return new Response(null,{status:302,headers:{Location:appUrl()+(p.manageAccess?'/':'/deputies')+'?view=calendar&calendarError='+encodeURIComponent(error.message),'Cache-Control':'no-store'}});}
});}
