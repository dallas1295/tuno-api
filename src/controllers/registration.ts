import { User } from "../models/user.ts";
import { Response } from "../utils/response.ts";
import { HTTPMetrics } from "../utils/metrics.ts";
import { Context } from "@oak/oak";
import { UserService } from "../services/user.ts";
import { tokenService } from "../services/token.ts";

export async function registration(ctx: Context) {
  HTTPMetrics.track("POST", "/register");

  try {
    const body = await ctx.request.body.json();

    if (!body?.username || !body?.email || !body?.password) {
      return Response.badRequest(ctx, "Missing required fields");
    }

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
  }
}

// TODO: need to fix the catch statements to use instance of to root out possible fail reasons... return unauthorized if it's DB error.
// TODO: need to check if the set up for my success response in try block is accurate and what I want.
// TODO: ensure that i make sure there's no other required responses in the try block
