import { api, readBody } from "@/server/http";
import { editRhythmItem } from "@/server/rhythm";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(request, async (p) => ({
    item: await editRhythmItem(
      p,
      (await context.params).id,
      await readBody(request),
    ),
  }));
}
