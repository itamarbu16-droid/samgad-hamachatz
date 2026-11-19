import {flushPush} from "@/server/notifications";
import {queueOverdueDigests} from "@/server/overdue-digest";
import { createHash, timingSafeEqual } from "node:crypto";
import { refreshRhythmSchedule } from "@/server/rhythm";
import { flushRhythmMail } from "@/server/rhythm-mail";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
    ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`)
    : null;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (
    !expected ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (new URL(request.url).searchParams.get('check') === '1') {
      // Authenticated deployment check; never return connection strings or user data.
      return Response.json({
        databaseFingerprint:createHash('sha256').update(process.env.DATABASE_URL || '').digest('hex'),
        schedulerConfigured:true,
      },{headers:{'Cache-Control':'no-store'}});
    }
    await refreshRhythmSchedule();
    const digests = await queueOverdueDigests();
    await flushPush();
    const result = await flushRhythmMail();
    return Response.json({...result, digests}, {
      status: result.failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Rhythm scheduler failed");
    return Response.json({ error: "Scheduler failed" }, { status: 503 });
  }
}
