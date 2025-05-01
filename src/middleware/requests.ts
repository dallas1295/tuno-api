import { Context, Next } from "@oak/oak";

export function requestSizeLimiter(maxSize: number) {
  return async function (ctx: Context, next: Next) {
    const contentLength = parseInt(
      ctx.request.headers.get("content-length") || "0",
    );

    if (contentLength > maxSize) {
      ctx.response.status = 413;
      ctx.response.body = {
        error: "Payload too large",
        maxSize,
        receivedSize: contentLength,
      };
      return;
    }

    await next();
  };
}

export async function requestTracingMiddleware(ctx: Context, next: Next) {
  const requestId = ctx.request.headers.get("X-Request-ID") ||
    crypto.randomUUID();

  ctx.response.headers.set("X-Request-ID", requestId);

  await next();
}
