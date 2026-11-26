import { api } from "@/server/http";
import { searchWorkspace } from "@/server/search";
export async function GET(request: Request) {
  return api(request, p => searchWorkspace(p, new URL(request.url).searchParams.get("q")));
}
