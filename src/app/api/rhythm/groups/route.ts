import { api, readBody } from "@/server/http";
import { saveRhythmGroup } from "@/server/rhythm";
export async function POST(request: Request) {
  return api(request, async (p) => ({
    group: await saveRhythmGroup(p, await readBody(request)),
  }));
}
