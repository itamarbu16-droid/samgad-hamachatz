import {and,eq,inArray,isNull,lt} from 'drizzle-orm';
import {randomUUID,createECDH,createPrivateKey,sign} from 'node:crypto';
import {z} from 'zod';
import {getDb,type Database} from './db';
import * as s from './schema';
import {AppError,type Principal} from './policy';
import {seal,unseal} from './google-calendar';
type Executor=Parameters<Parameters<Database['transaction']>[0]>[0];
export async function queueTaskNotification(tx:Executor,p:Principal,recipients:string[],title:string,body:string){
 const managers=await tx.select({id:s.workspaceSettings.ownerId}).from(s.workspaceSettings).where(eq(s.workspaceSettings.organizationId,p.organizationId));
 for(const id of new Set([...recipients,...managers.map(m=>m.id)])){
  if(id===p.userId)continue;
  await tx.insert(s.pushEvents).values({id:randomUUID(),organizationId:p.organizationId,recipientId:id,title,body:body.slice(0,180),url:id===managers[0]?.id?'/?view=tasks':'/deputies?view=tasks'});
 }
}
export async function pushKey(p:Principal){
 const db=await getDb();let [row]=await db.select().from(s.pushConfig).where(eq(s.pushConfig.organizationId,p.organizationId));
 if(!row){const ecdh=createECDH('prime256v1');ecdh.generateKeys();await db.insert(s.pushConfig).values({organizationId:p.organizationId,publicKey:ecdh.getPublicKey().toString('base64url'),encryptedPrivateKey:seal({key:ecdh.getPrivateKey().toString('base64url')})}).onConflictDoNothing();[row]=await db.select().from(s.pushConfig).where(eq(s.pushConfig.organizationId,p.organizationId));}
 return row;
}
export function validPushEndpoint(endpoint:string){
 try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
export async function subscribePush(p:Principal,input:unknown){
 const data=z.object({endpoint:z.string().url().max(2500),keys:z.object({p256dh:z.string().max(120),auth:z.string().max(50)})}).parse(input);
 if(!validPushEndpoint(data.endpoint)||Buffer.from(data.keys.p256dh,'base64url').length!==65||Buffer.from(data.keys.auth,'base64url').length!==16)throw new AppError(422,'מנוי התראות אינו תקין');
 const db=await getDb();await pushKey(p);
 await db.insert(s.pushSubscriptions).values({id:randomUUID(),organizationId:p.organizationId,userId:p.userId,endpoint:data.endpoint,...data.keys}).onConflictDoUpdate({target:s.pushSubscriptions.endpoint,set:{organizationId:p.organizationId,userId:p.userId,...data.keys}});
 return {ok:true};
}
export async function unsubscribePush(p:Principal,input:unknown){const {endpoint}=z.object({endpoint:z.string()}).parse(input);await (await getDb()).delete(s.pushSubscriptions).where(and(eq(s.pushSubscriptions.userId,p.userId),eq(s.pushSubscriptions.organizationId,p.organizationId),eq(s.pushSubscriptions.endpoint,endpoint)));return {ok:true};}
export async function pendingPush(p:Principal){
 const db=await getDb();return db.select({id:s.pushEvents.id,title:s.pushEvents.title,body:s.pushEvents.body,url:s.pushEvents.url}).from(s.pushEvents).where(and(eq(s.pushEvents.organizationId,p.organizationId),eq(s.pushEvents.recipientId,p.userId))).orderBy(s.pushEvents.createdAt).limit(20);
}
export async function acknowledgePush(p:Principal,input:unknown){const {ids}=z.object({ids:z.array(z.string()).max(20)}).parse(input);if(ids.length)await (await getDb()).delete(s.pushEvents).where(and(eq(s.pushEvents.organizationId,p.organizationId),eq(s.pushEvents.recipientId,p.userId),inArray(s.pushEvents.id,ids)));return {ok:true};}
export function vapidAuthorization(endpoint:string,publicKey:string,privateKey:string){
 const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),h=enc({typ:'JWT',alg:'ES256'}),claims=enc({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:'https://samgad-hamachatz-git-feature-personal-rhythm-itamar14.vercel.app'}),data=h+'.'+claims;
 const raw=Buffer.from(publicKey,'base64url'),key=createPrivateKey({key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url'),d:privateKey},format:'jwk'});
 return `vapid t=${data}.${sign('sha256',Buffer.from(data),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')}, k=${publicKey}`;
}
export async function flushPush(){
 const db=await getDb(),events=await db.select().from(s.pushEvents).where(and(isNull(s.pushEvents.sentAt),lt(s.pushEvents.attempts,5))).limit(50);
 for(const event of events){
  // Claim each delivery once across concurrent post-response workers.
  const [claimed]=await db.update(s.pushEvents).set({attempts:event.attempts+1,sentAt:new Date()}).where(and(eq(s.pushEvents.id,event.id),isNull(s.pushEvents.sentAt),eq(s.pushEvents.attempts,event.attempts))).returning();if(!claimed)continue;
  const subscriptions=await db.select().from(s.pushSubscriptions).innerJoin(s.memberships,and(eq(s.memberships.userId,s.pushSubscriptions.userId),eq(s.memberships.organizationId,s.pushSubscriptions.organizationId),eq(s.memberships.active,true))).where(and(eq(s.pushSubscriptions.userId,event.recipientId),eq(s.pushSubscriptions.organizationId,event.organizationId)));
  const [config]=await db.select().from(s.pushConfig).where(eq(s.pushConfig.organizationId,event.organizationId));if(!config)continue;
  const privateKey=(unseal(config.encryptedPrivateKey) as {key:string}).key;
  let retry=false;
  for(const {push_subscriptions:subscription} of subscriptions){
   if(!validPushEndpoint(subscription.endpoint))continue;
   try{const response=await fetch(subscription.endpoint,{method:'POST',headers:{Authorization:vapidAuthorization(subscription.endpoint,config.publicKey,privateKey),TTL:'86400',Urgency:'high','Content-Length':'0'},redirect:'error',signal:AbortSignal.timeout(8000)});
    if([404,410].includes(response.status))await db.delete(s.pushSubscriptions).where(eq(s.pushSubscriptions.id,subscription.id));else if(!response.ok)retry=true;
   }catch{retry=true;}
  }
  if(retry)await db.update(s.pushEvents).set({sentAt:null}).where(eq(s.pushEvents.id,event.id));
 }
 // Pending notifications older than a month no longer belong on devices.
 await db.delete(s.pushEvents).where(lt(s.pushEvents.createdAt,new Date(Date.now()-30*86400000)));
}
