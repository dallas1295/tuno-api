import { validateEmail, validatePassword } from "../utils/validators.ts";
import { tokenService } from "../services/tokenService.ts";
import * as jose from "@panva/jose";
import { Context, Next } from "@oak/oak";

export async function authMiddleware(ctx: Context, next: Next) {
  try {
    const authHeader = ctx.request.headers.get("Authorization");

    if (!authHeader) {
      ctx.response.status = 401;
      ctx.response.body = { message: "No authorization header" };
      return;
    }

    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid authorization format" };
      return;
    }

    if (await tokenService.isTokenBlacklisted(token)) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Token has been blacklisted" };
      return;
    }

    const payload = await tokenService.verifyToken(token);
    ctx.state.user = payload;
    return next();
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Token expired" };
    } else if (error instanceof jose.errors.JWTInvalid) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Token invalid" };
    } else {
      console.error("Authentication error:", error);
      ctx.response.status = 500;
      ctx.response.body = { message: "Internal server error" };
    }
    return;
  }
}

export async function validateInput(ctx: Context, next: Next) {
  try {
    const bodyJson = ctx.request.body;
    const body = await bodyJson.json();

    if (!body.email || !body.password) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Email and password are required" };
      return;
    }

    if (!validateEmail(body.email)) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Invalid email format" };
      return;
    }

    if (!validatePassword(body.password)) {
      ctx.response.status = 400;
      ctx.response.body = {
        message: "Invalid password format",
      };
      return;
    }

    await next();
  } catch (error) {
    ctx.response.status = 400;
    ctx.response.body = {
      error: error instanceof Error ? error.message : "Invalid request body",
    };

    return;
  }
}
