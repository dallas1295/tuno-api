import { Context, Next } from "@oak/oak";
import "@std/dotenv/load";

export async function corsMiddleware(ctx: Context, next: Next) {
  try {
    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN"); //Frontend URL

    ctx.response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    ctx.response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    ctx.response.headers.set(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    ctx.response.headers.set("Access-Control-Max-Age", "3600");
    ctx.response.headers.set("Access-Control-Allow-Credentials", "true");

    if (ctx.request.method === "OPTIONS") {
      ctx.response.status = 204;
      return;
    }

    await next();
  } catch (error) {
    console.error("CORS error:", error);
    throw error;
  }
}
