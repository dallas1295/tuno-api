import { tokenService } from "../services/token.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";

export async function logout(ctx: Context) {
  HTTPMetrics.track("POST", "/logout");

  try {
    const accessToken = await ctx.cookies.get("accessToken");
    const refreshToken = await ctx.cookies.get("refreshToken");

    if (!accessToken && !refreshToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "logout_no_tokens_found",
      });
      return Response.unauthorized(ctx, "Invalid authorization token");
    }

    if (!refreshToken) {
      return Response.badRequest(ctx, "Missing refresh token");
    }

    const tokensToBlacklist = [];
    if (accessToken) {
      tokensToBlacklist.push({ token: accessToken, type: "access" as const });
    }
    if (refreshToken) {
      tokensToBlacklist.push({ token: refreshToken, type: "refresh" as const });
    }

    if (tokensToBlacklist.length > 0) {
      await tokenService.blacklistTokens(tokensToBlacklist);
    }

    ctx.cookies.delete("accessToken", { path: "/" });
    ctx.cookies.delete("refreshToken", { path: "/" });

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
