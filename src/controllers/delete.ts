import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";
import { UserService } from "../services/user.ts";
import { DeleteUserRequest } from "../models/user.ts";
import { tokenService } from "../services/token.ts";

export async function deleteUser(ctx: Context) {
  HTTPMetrics.track("POST", "/delete");
  // remember that deleteUser requires 2 password fields to verify.
  const userId = ctx.state.user?.userId;
  if (!userId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "change_email_unauthorized",
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
      const userService = await UserService.initialize();

      const user = await userService.findById(userId);
      if (!user) {
        return Response.unauthorized(ctx, "User not found");
      }

      await tokenService.blacklistTokens([
        { token: ctx.state.accessToken, type: "access" },
        { token: ctx.state.refreshToken, type: "refresh" },
      ]);

      await userService.deleteUser(
        user.userId,
        req.passwordOne,
        req.passwordTwo,
      );
    } catch (error) {
      if (error instanceof Error) {
        Response.badRequest(ctx, error.message);
      }

      throw error;
    }

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
