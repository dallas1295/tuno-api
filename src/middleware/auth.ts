import { validateEmail, validatePassword } from "../utils/validators.ts";
import { tokenService } from "../services/token.ts";
import { Response } from "../utils/response.ts";
import * as jose from "@panva/jose";
import { Context, Next } from "@oak/oak";

export async function authMiddleware(ctx: Context, next: Next) {
  try {
    const token = await ctx.cookies.get("accessToken");

    if (!token) {
      Response.unauthorized(ctx, "No access token cookie");
      return;
    }

    if (await tokenService.isTokenBlacklisted(token)) {
      Response.unauthorized(ctx, "Token has been blacklisted");
      return;
    }

    const payload = await tokenService.verifyToken(token);
    ctx.state.user = payload;
    ctx.state.accessToken = token;
    return next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      Response.unauthorized(ctx, "Token expired");
    } else if (error instanceof jose.errors.JWTInvalid) {
      Response.unauthorized(ctx, "Token invalid");
    } else {
      console.error("Authentication error:", error);
      Response.internalError(ctx, "Internal server error");
    }
    return;
  }
}

export async function validateInput(ctx: Context, next: Next) {
  try {
    const bodyJson = ctx.request.body;
    const body = await bodyJson.json();

    if (!body.email || !body.password) {
      Response.badRequest(ctx, "Email and password are required");
      return;
    }

    if (!validateEmail(body.email)) {
      Response.badRequest(ctx, "Invalid email format");
      return;
    }

    if (!validatePassword(body.password)) {
      Response.badRequest(ctx, "Invalid password format");
      return;
    }

    await next();
  } catch (error) {
    Response.badRequest(
      ctx,
      error instanceof Error ? error.message : "Invalid request body",
    );

    return;
  }
}
