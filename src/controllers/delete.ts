import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";
import { DeleteUserRequest } from "../models/user.ts";
import { userService } from "../config/serviceSetup.ts";
import { tokenService } from "../services/token.ts";

export async function deleteUser(ctx: Context) {
  HTTPMetrics.track("POST", "/delete");
  const userId = ctx.state.user?.userId;
  if (!userId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "account_deletion_failed",
    });

    return Response.unauthorized(ctx, "Missing or invalid Token");
  }

  try {
    const body = await ctx.request.body.json();
    const req: DeleteUserRequest = {
      passwordOne: body.passwordOne.trim(),
      passwordTwo: body.passwordTwo.trim(),
    };

    if (req.passwordOne !== req.passwordTwo) {
      return Response.badRequest(ctx, "Passwords do not match");
    }

    try {
      const user = await userService.findById(userId);
      if (!user) {
        return Response.unauthorized(ctx, "User not found");
      }

      await userService.deleteUser(
        user.userId,
        req.passwordOne,
        req.passwordTwo,
      );

      await tokenService.blacklistTokens([
        { token: ctx.state.accessToken, type: "access" },
        { token: ctx.state.refreshToken, type: "refresh" },
      ]);
    } catch (error) {
      if (error instanceof Error) {
        Response.badRequest(ctx, error.message);
      }

      throw error;
    }

    ctx.cookies.delete("accessToken", { path: "/" });
    ctx.cookies.delete("refreshToken", { path: "/" });

    return Response.success(ctx, "User has been permanently deleted");
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "delete_user",
    });

    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error deleting user",
    );
  }
}
