import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { LoginRequest } from "../models/user.ts";
import { toUserResponse } from "../dto/user.ts";
import { verifyPassword } from "../services/password.ts";
import { tokenService } from "../services/token.ts";
import { verifyTOTP } from "../utils/totp.ts";
import { UserService } from "../services/user.ts";
import { RateLimiter } from "../utils/rateLimiter.ts";
import { Context } from "@oak/oak";
import * as OTPAuth from "@hectorm/otpauth";

export async function login(ctx: Context) {
  HTTPMetrics.track("POST", "/login");

  const loginReq = await ctx.request.body.json() as LoginRequest;
  try {
    if (!loginReq || !loginReq.username || !loginReq.password) {
      return Response.badRequest(ctx, "Invalid Input");
    }

    if (await RateLimiter.isRateLimited(ctx.request.ip, loginReq.username)) {
      return Response.tooManyRequests(
        ctx,
        "Too many login attempts. Please try again later.",
      );
    }

    const userService = await UserService.initialize();

    const user = await userService.findByUsername(loginReq.username);
    if (!user) {
      await RateLimiter.trackAttempt(ctx.request.ip, loginReq.username);
      return Response.unauthorized(ctx, "User doesn't exist");
    }

    const checkPassword = await verifyPassword(
      user.passwordHash,
      loginReq.password,
    );
    if (!checkPassword) {
      await RateLimiter.trackAttempt(ctx.request.ip, loginReq.username);
      return Response.unauthorized(ctx, "Invalid password");
    }

    await RateLimiter.resetAttempts(ctx.request.ip, loginReq.username);

    if (user.twoFactorEnabled) {
      const temp = await tokenService.generateTempToken(
        user.userId,
        "5m",
      );
      return Response.success(ctx, {
        requireTwoFactor: true,
        tempToken: temp,
        user: user.username,
      });
    }

    const token = await tokenService.generateTokenPair(user);
    const links = {
      self: { href: `/users/${user.userId}`, method: "GET" },
      logout: { href: "/auth/logout", method: "POST" },
    };
    const userResponse = toUserResponse(user, links);

    return Response.success(ctx, {
      token,
      user: userResponse,
    });
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "login",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error logging in",
    );
  }
}

export async function withTwoFactor(ctx: Context) {
  HTTPMetrics.track("POST", "/login/2fa");

  try {
    const body = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Invalid input");
    }

    if (
      typeof body.tempToken !== "string" || typeof body.totpCode !== "string"
    ) {
      return Response.badRequest(ctx, "Invalid input");
    }

    const { tempToken, totpCode } = body;

    if (totpCode.length !== 6) {
      return Response.badRequest(ctx, "Invalid TOTP code format");
    }

    // Check rate limiting for 2FA attempts
    if (await RateLimiter.isRateLimited(ctx.request.ip)) {
      return Response.tooManyRequests(
        ctx,
        "Too many 2FA attempts. Please try again later.",
      );
    }

    const payload = await tokenService.verifyTempToken(tempToken);
    if (!payload || payload.type !== "temp" || !payload.userId) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(ctx, "Invalid or expired 2FA session");
    }

    const userService = await UserService.initialize();
    const user = await userService.findById(payload.userId);
    if (!user) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(ctx, "User not found");
    }

    const isValidTotp = verifyTOTP(
      OTPAuth.Secret.fromBase32(user.twoFactorSecret!),
      totpCode,
    );
    if (!isValidTotp) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(ctx, "Invalid 2FA code");
    }

    // Reset rate limiting on successful 2FA
    await RateLimiter.resetAttempts(ctx.request.ip);

    const token = await tokenService.generateTokenPair(user);
    const links = {
      self: { href: `/users/${user.userId}`, method: "GET" },
      logout: { href: "/auth/logout", method: "POST" },
    };

    const userResponse = toUserResponse(user, links);

    return Response.success(ctx, {
      token,
      user: userResponse,
    });
  } catch (error) {
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error verifying totp",
    );
  }
}

export async function withRecovery(ctx: Context) {
  HTTPMetrics.track("POST", "/login/recovery");
}
