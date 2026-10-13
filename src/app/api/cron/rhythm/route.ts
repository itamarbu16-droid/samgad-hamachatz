import { timingSafeEqual } from "node:crypto";
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
    await refreshRhythmSchedule();
    const result = await flushRhythmMail();
    return Response.json(result, {
      status: result.failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Rhythm scheduler failed");
    return Response.json({ error: "Scheduler failed" }, { status: 503 });
  }
}
