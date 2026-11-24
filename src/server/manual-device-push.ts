import {and,eq,gte,like,lt,sql} from 'drizzle-orm';
import {createECDH,createHash} from 'node:crypto';
import {z} from 'zod';
import {getDb,type Database} from './db';
import {overdueDigestRuns as ledger,pushConfig,pushSubscriptions} from './schema';
import {hourlyPrincipal} from './hourly-task-selection';
import {AppError,type Principal} from './policy';
import {seal,unseal} from './google-calendar';
import {validPushEndpoint,vapidAuthorization} from './notifications';
import {currentRecipientTarget,manualRecipientPrefix,readManualClaim,type ReminderRef} from './manual-task-reminder-state';

export const manualPhoneVersion=1;
const maxDevices=4;
const wakeTtlSeconds=120;
const wakeKey='manual-phone-v1-wake:';
const deviceNamespace='manual-phone-v1-device:';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const deviceRecordId=(endpoint:string)=>deviceNamespace+hash(endpoint);
const deviceBinding=(mailbox:string,userId:string)=>hash(JSON.stringify([mailbox,userId]));
const wakePrefix=(origin:string,org:string,userId:string,endpoint:string)=>wakeKey+
 createHash('sha256').update(JSON.stringify([origin,org,userId,endpoint])).digest('hex')+':';
const deviceInput=z.object({version:z.literal(manualPhoneVersion),endpoint:z.string().url().max(1800).refine(validPushEndpoint)}).strict();
type DeviceDb=Pick<Database,'select'>;

/**
 * Scoped key and encrypted device records use reserved IDs in push_config.
 * No dedicated endpoint is stored in the ordinary push_subscriptions table:
 * immutable legacy subscribe/unsubscribe and ordinary/hourly delivery cannot
 * fetch or modify this registry. Neither reserved ID is a real workspace ID.
 */
export function manualDeviceScopes(origin:string,org:string){
 const parsed=new URL(origin);
 if(parsed.origin!==origin||!(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))))throw new AppError(403,'כתובת ההרשמה אינה תקינה');
 const token=createHash('sha256').update(JSON.stringify([manualPhoneVersion,origin,org])).digest('hex');
 return {mailbox:'manual-phone-v1-mailbox:'+token,config:'manual-phone-v1-key:'+token};
}
async function assertMember(db:DeviceDb,p:Principal){
 if(p.guest||!await hourlyPrincipal(db,p.organizationId,p.userId))throw new AppError(403,'אין הרשאה להפעלת תזכורות במכשיר');
}
async function isolatedConfig(db:DeviceDb,org:string,origin:string){
 const scopes=manualDeviceScopes(origin,org);
 const [row]=await db.select().from(pushConfig).where(eq(pushConfig.organizationId,scopes.config));
 const [ordinary]=await db.select({key:pushConfig.publicKey}).from(pushConfig).where(eq(pushConfig.organizationId,org));
 const [mailboxKey]=await db.select({id:pushConfig.organizationId}).from(pushConfig).where(eq(pushConfig.organizationId,scopes.mailbox));
 if(mailboxKey||(row&&row.publicKey===ordinary?.key))throw new AppError(409,'הרשמת ההתראות הייעודית אינה זמינה');
 return {scopes,row};
}

export async function getManualDeviceKey(p:Principal,origin:string,allocate=false){
 const db=await getDb();
 await assertMember(db,p);
 const current=await isolatedConfig(db,p.organizationId,origin);
 if(!current.row&&allocate){
  const pair=createECDH('prime256v1');
  pair.generateKeys();
  const publicKey=pair.getPublicKey().toString('base64url');
  await db.insert(pushConfig).values({organizationId:current.scopes.config,publicKey,
    encryptedPrivateKey:seal({key:pair.getPrivateKey().toString('base64url')})}).onConflictDoNothing();
  const {row}=await isolatedConfig(db,p.organizationId,origin);
  return {version:manualPhoneVersion,publicKey:row?.publicKey??null};
 }
 return {version:manualPhoneVersion,publicKey:current.row?.publicKey??null};
}

async function ordinaryEndpoint(db:DeviceDb,endpoint:string){
 return Boolean((await db.select({id:pushSubscriptions.id}).from(pushSubscriptions)
  .where(eq(pushSubscriptions.endpoint,endpoint)).limit(1)).length);
}

/** POST is only called after explicit browser enrollment for /manual-alerts-v1/.
 * Separate VAPID restriction and the ordinary endpoint guard are independent.
 * Existing endpoint ownership can never change without prior removal by its owner.
 */
export async function enrollManualDevice(p:Principal,origin:string,input:unknown){
 const {endpoint}=deviceInput.parse(input);
 const db=await getDb();
 return db.transaction(async tx=>{
  await assertMember(tx,p);
  const {row,scopes}=await isolatedConfig(tx,p.organizationId,origin);
  if(!row)throw new AppError(409,'יש להתחיל הפעלה ממסך התזכורות');
  if(await ordinaryEndpoint(tx,endpoint))throw new AppError(409,'הרשמת המכשיר אינה ייעודית לתזכורות ידניות');
  const binding=deviceBinding(scopes.mailbox,p.userId),id=deviceRecordId(endpoint);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${binding}))`);
  const devices=await tx.select({id:pushConfig.organizationId}).from(pushConfig).where(and(
   like(pushConfig.organizationId,deviceNamespace+'%'),eq(pushConfig.publicKey,binding))).limit(maxDevices);
  if(devices.length===maxDevices&&!devices.some(device=>device.id===id))throw new AppError(409,'נרשם מספר המכשירים המרבי לתזכורות');
  await tx.insert(pushConfig).values({organizationId:id,publicKey:binding,
   encryptedPrivateKey:seal({endpoint})}).onConflictDoNothing();
  const [stored]=await tx.select({owner:pushConfig.publicKey}).from(pushConfig).where(eq(pushConfig.organizationId,id)).limit(1);
  if(stored?.owner!==binding)throw new AppError(409,'הרשמת המכשיר אינה ייעודית לחשבון הזה');
  return {registered:true};
 });
}
export async function manualDeviceStatus(p:Principal,origin:string,input:unknown){
 const {endpoint}=deviceInput.parse(input),db=await getDb();
 await assertMember(db,p);
 const {row,scopes}=await isolatedConfig(db,p.organizationId,origin);
 if(!row||await ordinaryEndpoint(db,endpoint))return {registered:false};
 const entries=await db.select({id:pushConfig.organizationId}).from(pushConfig).where(and(
  eq(pushConfig.organizationId,deviceRecordId(endpoint)),eq(pushConfig.publicKey,deviceBinding(scopes.mailbox,p.userId)))).limit(1);
 return {registered:Boolean(entries.length)};
}
export async function removeManualDevice(p:Principal,origin:string,input:unknown){
 const {endpoint}=deviceInput.parse(input),db=await getDb(),{mailbox}=manualDeviceScopes(origin,p.organizationId);
 await assertMember(db,p);
 await db.delete(pushConfig).where(and(eq(pushConfig.organizationId,deviceRecordId(endpoint)),
  eq(pushConfig.publicKey,deviceBinding(mailbox,p.userId))));
 return {registered:false};
}

export async function checkManualDevice(p:Principal,origin:string,input:unknown,now=new Date()){
 const {endpoint}=deviceInput.parse(input);
 const status=await manualDeviceStatus(p,origin,input);
 if(!status.registered)return {show:false};
 const db=await getDb(),prefix=wakePrefix(origin,p.organizationId,p.userId,endpoint);
 const {mailbox}=manualDeviceScopes(origin,p.organizationId);
 return db.transaction(async tx=>{
  const pending=await tx.select({id:ledger.id}).from(ledger).where(and(like(ledger.id,prefix+'%'),
   gte(ledger.createdAt,new Date(now.getTime()-wakeTtlSeconds*1000)))).limit(4);
  for(const row of pending){
   const claimId=manualRecipientPrefix(p.organizationId,p.userId)+row.id.slice(prefix.length);
   const ref=await readManualClaim(tx,p,claimId,now);
   if(!ref||!await currentRecipientTarget(tx,p.organizationId,p.userId,ref,now))continue;
   // Claim only once, and only while this exact browser endpoint is still
   // registered to the authenticated recipient. Do not consume the app notice.
   const used=await tx.delete(ledger).where(and(eq(ledger.id,row.id),sql`EXISTS (
    SELECT 1 FROM push_config device WHERE device.organization_id = ${deviceRecordId(endpoint)}
     AND device.public_key = ${deviceBinding(mailbox,p.userId)}
   )`,sql`NOT EXISTS (SELECT 1 FROM push_subscriptions ordinary WHERE ordinary.endpoint = ${endpoint})`)).returning({id:ledger.id});
   if(used.length)return {show:true};
  }
  return {show:false};
 });
}

export async function wakeManualDevice(db:Database,org:string,origin:string,recipient:string,ref:ReminderRef,claimId:string,now:Date,request:typeof fetch){
 if(!await currentRecipientTarget(db,org,recipient,ref,now))return 'ineligible';
 const {row,scopes}=await isolatedConfig(db,org,origin);
 if(!row)return 'notEnrolled';
 const binding=deviceBinding(scopes.mailbox,recipient);
 const devices=await db.select({id:pushConfig.organizationId,secret:pushConfig.encryptedPrivateKey}).from(pushConfig)
  .where(and(like(pushConfig.organizationId,deviceNamespace+'%'),eq(pushConfig.publicKey,binding))).limit(maxDevices);
 const validated=await Promise.all(devices.map(async ({id,secret})=>{
  try{
   const {endpoint}=unseal<{endpoint:string}>(secret);
   if(deviceRecordId(endpoint)!==id||!validPushEndpoint(endpoint)||await ordinaryEndpoint(db,endpoint))return null;
   return {id,endpoint};
  }catch{return null;}
 }));
 const valid=validated.filter(device=>device!==null);
 if(!valid.length)return 'notEnrolled';
 let privateKey:string;
 try{privateKey=unseal<{key:string}>(row.encryptedPrivateKey).key;}catch{return 'unconfirmed';}
 const outcomes=await Promise.all(valid.map(async device=>{
  const prefix=wakePrefix(origin,org,recipient,device.endpoint);
  const marker=prefix+claimId.slice(manualRecipientPrefix(org,recipient).length);
  try{
   await db.delete(ledger).where(and(like(ledger.id,prefix+'%'),lt(ledger.createdAt,new Date(now.getTime()-60*60*1000))));
   // Reserve before sending: a worker may receive it before fetch returns.
   const stored=await db.insert(ledger).values({id:marker,createdAt:now}).onConflictDoNothing().returning({id:ledger.id});
   if(!stored.length)return false;
   const response=await request(device.endpoint,{method:'POST',headers:{
    Authorization:vapidAuthorization(device.endpoint,row.publicKey,privateKey),
    TTL:String(wakeTtlSeconds),Urgency:'normal',Topic:'manual-alert-v1','Content-Length':'0'},
    redirect:'error',signal:AbortSignal.timeout(3000)});
   if(!response.ok)await db.delete(ledger).where(eq(ledger.id,marker));
   if([404,410].includes(response.status))await db.delete(pushConfig).where(and(
    eq(pushConfig.organizationId,device.id),eq(pushConfig.publicKey,binding)));
   return response.ok;
  }catch{return false;}
 }));
 return outcomes.some(Boolean)?'accepted':'unconfirmed';
}
