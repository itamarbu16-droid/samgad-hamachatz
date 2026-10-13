import { after } from "next/server";
import { api } from "@/server/http";
import { getRhythm } from "@/server/rhythm";
import { flushRhythmMail } from "@/server/rhythm-mail";
export const maxDuration = 300;
export async function GET(request: Request) {
  return api(request, async (p) => {
    const data = await getRhythm(
      p,
      new URL(request.url).searchParams.get("month") || undefined,
    );
    after(async () => {
      try {
        await flushRhythmMail();
      } catch {
        console.error("Calendar mail flush failed");
      }
    });
    return data;
  });
}
