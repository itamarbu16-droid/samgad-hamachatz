import {z} from 'zod';
import {api,readBody} from '@/server/http';
import {appUrl} from '@/server/app-url';
import {assertManualDeviceContext,manualDeviceContext} from '@/server/manual-device-context';
import {enrollManualDevice,getManualDeviceKey,manualDeviceStatus,manualPhoneVersion,removeManualDevice} from '@/server/manual-device-push';

export async function GET(request:Request){return api(request,async (p,sessionId)=>{
 const origin=appUrl();
 return {...await getManualDeviceKey(p,origin),account:{organizationId:p.organizationId,userId:p.userId},
  context:manualDeviceContext(p,sessionId,origin)};
});}
export async function PUT(request:Request){return api(request,async (p,sessionId)=>{
 const origin=appUrl();assertManualDeviceContext(request,p,sessionId,origin);
 z.object({action:z.literal('key'),version:z.literal(manualPhoneVersion)}).strict().parse(await readBody(request,1024));
 return getManualDeviceKey(p,origin,true);
});}
export async function POST(request:Request){return api(request,async (p,sessionId)=>{
 const origin=appUrl();assertManualDeviceContext(request,p,sessionId,origin);
 return enrollManualDevice(p,origin,await readBody(request,3072));
});}
export async function PATCH(request:Request){return api(request,async (p,sessionId)=>{
 const origin=appUrl();assertManualDeviceContext(request,p,sessionId,origin);
 return manualDeviceStatus(p,origin,await readBody(request,3072));
});}
export async function DELETE(request:Request){return api(request,async (p,sessionId)=>{
 const origin=appUrl();assertManualDeviceContext(request,p,sessionId,origin);
 return removeManualDevice(p,origin,await readBody(request,3072));
});}
