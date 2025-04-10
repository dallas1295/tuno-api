import { User } from "../models/user.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";
import { UserService } from "../services/user.ts";
import { tokenService } from "../services/token.ts";

export async function registration(ctx: Context) {
  HTTPMetrics.track("POST", "/register");

  try {
    const body = await ctx.request.body.json();

    if (!body?.username || !body?.email || !body?.password) {
      ErrorCounter.add(1, {
        type: "validation",
        operation: "register",
      });
      return Response.badRequest(ctx, "Missing required fields");
    }

    try {
      const userService = await UserService.initialize();
      const user: User = await userService.createUser(
        body.username,
        body.email,
        body.password,
      );

      const tokens = await tokenService.generateTokenPair(user);

      return Response.success(ctx, {
        message: "User registered successfully",
        user: { username: user.username, email: user.email },
        ...tokens,
      });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      return Response.badRequest(ctx, "Invalid registration request");
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "register,",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error registering user",
    );
  }
}
