import { ChangeEmailRequest } from "../models/user.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { userService } from "../config/serviceSetup.ts";
import { ChangeRateLimit } from "../utils/rateLimiter.ts";
import { Response } from "../utils/response.ts";
import { RouterContext } from "@oak/oak";

export async function changeEmail(
  ctx: RouterContext<"/api/:userId/change-email">,
) {
  HTTPMetrics.track("PUT", "/change-email");

  const tokenUserId = ctx.state.user?.userId;
  const paramUserId = ctx.params?.userId;

  if (!tokenUserId || !paramUserId || tokenUserId !== paramUserId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "change_email_unauthorized",
    });
    return Response.unauthorized(
      ctx,
      "Missing or invalid Token",
    );
  }

  try {
    const body = await ctx.request.body.json();
    const req: ChangeEmailRequest = {
      newEmail: body.newEmail?.trim(),
    };

    if (!req.newEmail) {
      return Response.badRequest(ctx, "New email not provided");
    }

    try {
      const user = await userService.findById(tokenUserId);

      if (!user) {
        return Response.unauthorized(ctx, "User not found");
      }

      await userService.updateEmail(user.userId, req.newEmail);
    } catch (error) {
      if (error instanceof Error) {
        Response.badRequest(ctx, error.message);
      }
      throw error;
    }

    return Response.success(ctx, "User email has been updated");
  } catch (error) {
    if (error instanceof ChangeRateLimit) {
      ErrorCounter.add(1, {
        type: "rate_limit",
        operation: "change_email",
      });
      return Response.tooManyRequests(
        ctx,
        `Trying to update too frequently: ${error.daysUntil}`,
      );
    }
    ErrorCounter.add(1, {
      type: "internal",
      operation: "change_email",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error updating email",
    );
  }
}
