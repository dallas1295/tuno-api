import { UserService } from "../services/user.ts";
import { Response } from "../utils/response.ts";
import { Context } from "@oak/oak";

export async function getProfile(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      return Response.unauthorized(ctx, "User Id not found");
    }

    const userService = await UserService.initialize();
    const user = await userService.findById(userId);

    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    const userData = await userService.getProfile(user.userId);

    const profile = {
      ...userData,
      links: {
        self: { href: `/users/${user.userId}/profile`, method: "GET" },
        changeEmail: { href: `/users/${user.userId}/email`, method: "PUT" },
        changePassword: {
          href: `/users/${user.userId}/password`,
          method: "PUT",
        },
        changeUsername: {
          href: `/users/${user.userId}/username`,
          method: "PUT",
        },
        logout: { href: `/api/auth/logout` },
      },
    };

    return Response.success(ctx, profile);
  } catch (error) {
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error fetching profile",
    );
  }
}
