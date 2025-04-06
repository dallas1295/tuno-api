import { tokenService } from "../services/token.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";

export async function logout(ctx: Context) {
  HTTPMetrics.track("POST", "/logout");

  try {
    const authHeader = ctx.request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "logout_unauthorized",
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

    return Response.success(ctx, {
      data: { message: "Successfully logged out" },
    });
  } catch (error) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "logout",
    });

    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error logging out",
    );
  }
}
