import {createHmac,timingSafeEqual} from 'node:crypto';
import {AppError,type Principal} from './policy';

export const manualDeviceContextHeader='X-Samgad-Manual-Device-Context';
export function manualDeviceContext(p:Principal,sessionId:string,origin:string){
 const secret=process.env.BETTER_AUTH_SECRET;
 if(!secret)throw new Error('Missing auth secret');
 return createHmac('sha256',secret).update(JSON.stringify([
  'manual-device-registration-v1',origin,p.organizationId,p.userId,sessionId
 ])).digest('base64url');
}
export function assertManualDeviceContext(request:Request,p:Principal,sessionId:string,origin:string){
 const provided=request.headers.get(manualDeviceContextHeader)||'';
 const expected=manualDeviceContext(p,sessionId,origin);
 if(!/^[0-9A-Za-z_-]{43}$/.test(provided)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))
  throw new AppError(409,'החשבון או ההתחברות השתנו. יש לפתוח מחדש את ההרשמה');
}
