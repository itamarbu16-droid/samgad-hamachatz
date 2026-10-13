import { after } from "next/server";
import { api, readBody } from "@/server/http";
import { createRhythmItem } from "@/server/rhythm";
import { flushRhythmMail } from "@/server/rhythm-mail";
export const maxDuration = 300;
export async function POST(request: Request) {
  return api(request, async (p) => {
    const item = await createRhythmItem(p, await readBody(request));
    after(async () => {
      try {
        await flushRhythmMail();
      } catch {
        console.error("Assignment mail flush failed");
      }
    });
    return { item };
  });
}
