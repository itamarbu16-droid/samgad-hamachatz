import {api,readBody} from '@/server/http';
import {pendingPush,acknowledgePush} from '@/server/notifications';
export async function GET(r:Request){return api(r,pendingPush);}
export async function POST(r:Request){return api(r,async p=>acknowledgePush(p,await readBody(r)));}
