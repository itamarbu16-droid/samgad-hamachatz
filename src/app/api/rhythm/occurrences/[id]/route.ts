import { api, readBody } from "@/server/http";
import { completeRhythm } from "@/server/rhythm";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => ({
    occurrence: await completeRhythm(
      p,
      (await context.params).id,
      await readBody(request),
    ),
  }));
}
