import {APP_RELEASE} from '@/lib/app-release';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({version:APP_RELEASE},{headers:{'Cache-Control':'no-store'}});}
