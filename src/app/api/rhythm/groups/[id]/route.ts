import { api, readBody } from "@/server/http";
import { saveRhythmGroup } from "@/server/rhythm";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => ({
    group: await saveRhythmGroup(
      p,
      await readBody(request),
      (await context.params).id,
    ),
  }));
}
