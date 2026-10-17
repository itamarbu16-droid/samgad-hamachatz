import {emblemBase64} from '@/lib/romach-emblem';
export async function GET(){return new Response(Buffer.from(emblemBase64,'base64'),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});}
