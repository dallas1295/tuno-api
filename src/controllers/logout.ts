import { tokenService } from "../services/tokenService.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter } from "../utils/metrics.ts";
import { Context } from "@oak/oak";

export async function logout(ctx: Context) {
  try {
    const authHeader = ctx.request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "failed_logout",
      });
      return Response.unauthorized(ctx, "Invalid authorization token");
    }

    const accessToken = authHeader.substring("Bearer ".length);

    const refreshToken = ctx.request.headers.get("Refresh-Token");

    if (!refreshToken) {
      return Response.badRequest(ctx, "Missing refresh token");
    }

    await tokenService.blacklistToken([
      { token: accessToken, type: "access" },
      { token: refreshToken, type: "refresh" },
    ]);

    // ... rest of logout logic
  } catch (error) {
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error logging out",
    );
  }
}
