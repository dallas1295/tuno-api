import { User } from "../models/user.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";
import { tokenService } from "../services/token.ts";
import { userService } from "../config/serviceSetup.ts";

export async function register(ctx: Context) {
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

    let user: User;

    try {
      user = await userService.createUser(
        body.username,
        body.email,
        body.password,
      );
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }

    const tokens = await tokenService.generateTokenPair(user);

    return Response.created(ctx, {
      message: "User registered successfully",
      user: { username: user.username, email: user.email },
      token: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
      links: {
        self: { href: "/auth/login", method: "POST" },
      },
    });
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "register",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error registering user",
    );
  }
}
