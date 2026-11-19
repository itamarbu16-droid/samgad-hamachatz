import { api, readBody } from '@/server/http';
import { createQuickPointKey, quickPointStatus, revokeQuickPointKey } from '@/server/quick-points';
export async function GET(request: Request) { return api(request, quickPointStatus); }
export async function POST(request: Request) { return api(request, async p => createQuickPointKey(p, await readBody(request))); }
export async function DELETE(request: Request) { return api(request, revokeQuickPointKey); }
