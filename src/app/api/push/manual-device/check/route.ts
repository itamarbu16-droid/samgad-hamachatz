import {api,readBody} from '@/server/http';
import {appUrl} from '@/server/app-url';
import {checkManualDevice} from '@/server/manual-device-push';
export async function POST(request:Request){return api(request,async p=>checkManualDevice(p,appUrl(),await readBody(request,3072)));}
