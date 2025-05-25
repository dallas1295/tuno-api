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

    const tokenPair = await tokenService.generateTokenPair(user);

    // Set cookies instead of returning tokens in the body
    ctx.cookies.set("accessToken", tokenPair.accessToken, {
      httpOnly: true,
      secure: true, // Should be true (HTTPS)
      sameSite: "lax",
      path: "/",
    });

    ctx.cookies.set("refreshToken", tokenPair.refreshToken, {
      httpOnly: true,
      secure: true, // Should be true (HTTPS)
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return Response.created(ctx, {
      message: "User registered successfully",
      user: { username: user.username, email: user.email },
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
