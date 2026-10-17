import {api,readBody} from '@/server/http';
import {pushKey,subscribePush,unsubscribePush} from '@/server/notifications';
export async function GET(r:Request){return api(r,async p=>({publicKey:(await pushKey(p)).publicKey}));}
export async function POST(r:Request){return api(r,async p=>subscribePush(p,await readBody(r)));}
export async function DELETE(r:Request){return api(r,async p=>unsubscribePush(p,await readBody(r)));}
