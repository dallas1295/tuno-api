import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { userService } from "../config/serviceSetup.ts";
import { Response } from "../utils/response.ts";
import { Context } from "@oak/oak";
import { makeUserLink } from "../utils/makeLinks.ts";

export async function getProfile(ctx: Context) {
  HTTPMetrics.track("GET", "/profile");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      return Response.unauthorized(ctx, "Missing or invalid Token");
    }

    const user = await userService.findById(userId);

    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    const userData = await userService.getProfile(user.userId);

    const profile = {
      ...userData,
      links: {
        self: makeUserLink(user.userId, "self"),
        changeEmail: makeUserLink(user.userId, "changeEmail"),
        changePassword: makeUserLink(user.userId, "changePassword"),
        changeUsername: makeUserLink(user.userId, "changeUsername"),
        logout: { href: `/api/auth/logout` },
      },
    };

    return Response.success(ctx, profile);
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "get_profile",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error fetching profile",
    );
  }
}
