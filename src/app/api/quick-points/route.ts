import { ZodError } from 'zod';
import { AppError } from '@/server/policy';
import { captureQuickPoint } from '@/server/quick-points';
import { readBody } from '@/server/http';
export const runtime = 'nodejs';
// Shortcut bearer-only endpoint: no cookie auth, no CORS, no credentials in URLs.
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (new URL(request.url).search) throw new AppError(400, 'אין להעביר טקסט או הרשאות בכתובת');
    if (!request.headers.get('content-type')?.includes('application/json')) throw new AppError(415, 'יש לשלוח JSON');
    const token = request.headers.get('authorization')?.match(/^Bearer (qp_[A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new AppError(401, 'קיצור הדרך אינו מורשה');
    return Response.json(await captureQuickPoint(token, await readBody(request, 30000)), { headers });
  } catch (error) {
    const status = error instanceof AppError ? error.status : error instanceof ZodError ? 422 : error instanceof SyntaxError ? 400 : 503;
    const message = error instanceof AppError ? error.message : error instanceof ZodError ? 'יש להזין נקודה בת 2–5000 תווים ומזהה בקשה תקין' : 'הנקודה לא נשמרה. יש לנסות שוב';
    return Response.json({ saved: false, error: message }, { status, headers });
  }
}
