import { api, readBody } from "@/server/http";
import { undoRhythm } from "@/server/rhythm";
export async function POST(request: Request) {
  return api(request, async p => undoRhythm(p, await readBody(request)));
}
