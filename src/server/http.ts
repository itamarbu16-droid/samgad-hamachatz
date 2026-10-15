import { ZodError } from "zod";
import { getAuth } from "./auth";
import { AppError, type Principal } from "./policy";
import { principalFor } from "./service";
import { publicPrincipal } from "./access";
import { appUrl } from "./app-url";

export async function api(
  request: Request,
  handler: (principal: Principal) => Promise<unknown>,
) {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const expected = appUrl();
      if (!expected || origin !== expected)
        throw new AppError(403, "הבקשה לא הגיעה מכתובת היישום המאושרת");
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new AppError(415, "פורמט הבקשה אינו נתמך");
    }
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    let principal: Principal;
    if(!session){
      if(request.method!=='GET')throw new AppError(401,"יש להתחבר כדי לערוך");
      principal=await publicPrincipal();
    }else{
      try { principal=await principalFor(session.user.id,session.user.name); }
      catch(error){if(request.method!=='GET' || !(error instanceof AppError) || error.status!==403)throw error;principal=await publicPrincipal();}
    }
    const result = await handler(principal);
    if (result instanceof Response) return result;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError)
      return Response.json(
        {
          error: "יש לבדוק את השדות ולהזין פרטים תקינים",
          fields: error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "לא ניתן לקרוא את הבקשה" },
        { status: 400 },
      );
    console.error("Application request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "לא ניתן להשלים את הפעולה כעת. יש לנסות שוב" },
      { status: 503 },
    );
  }
}
export async function readBody(request: Request, maxLength = 20_000) {
  const text = await request.text();
  if (text.length > maxLength) throw new AppError(413, "הבקשה גדולה מדי");
  return JSON.parse(text) as unknown;
}
