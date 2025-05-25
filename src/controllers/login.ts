import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { LoginRequest } from "../models/user.ts";
import { toUserResponse } from "../dto/user.ts";
import { verifyPassword } from "../services/password.ts";
import { tokenService } from "../services/token.ts";
import { verifyTOTP } from "../utils/totp.ts";
import { RateLimiter } from "../utils/rateLimiter.ts";
import { Context } from "@oak/oak";
import * as OTPAuth from "@hectorm/otpauth";
import { userService } from "../config/serviceSetup.ts";
import { makeUserLink } from "../utils/makeLinks.ts";

export async function login(ctx: Context) {
  HTTPMetrics.track("POST", "/login");

  try {
    const loginReq = (await ctx.request.body.json()) as LoginRequest;
    if (!loginReq || !loginReq.username || !loginReq.password) {
      return Response.badRequest(ctx, "Invalid Input");
    }

    if (await RateLimiter.isRateLimited(ctx.request.ip, loginReq.username)) {
      return Response.tooManyRequests(
        ctx,
        "Too many login attempts. Please try again later.",
      );
    }

    const user = await userService.findByUsername(loginReq.username);
    if (!user) {
      await RateLimiter.trackAttempt(ctx.request.ip, loginReq.username);
      return Response.unauthorized(ctx, "User doesn't exist");
    }

    try {
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
        const recoveryAvailable =
          user.recoveryCodes && user.recoveryCodes.length > 0;

        const temp = await tokenService.generateTempToken(
          user.userId,
          "5m",
          recoveryAvailable!,
        );

        return Response.success(ctx, {
          requireTwoFactor: true,
          tempToken: temp,
          user: user.username,
          recoveryAvailable,
        });
      }

      const tokenPair = await tokenService.generateTokenPair(user);
      const links = {
        self: makeUserLink(user.userId, "self"),
        logout: { href: "/auth/logout", method: "POST" },
      };
      const userResponse = toUserResponse(user, links);

      const isProd = Deno.env.get("ENV") === "PROD";

      ctx.cookies.set("accessToken", tokenPair.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
      });

      ctx.cookies.set("refreshToken", tokenPair.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (longer than access token)
      });

      console.log("Successful Login");
      return Response.success(ctx, {
        user: userResponse,
      });
    } catch (error) {
      if (error instanceof Error) {
        Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "login",
    });
    console.log("Login Failed");
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error logging in",
    );
  }
}

export async function withTwoFactor(ctx: Context) {
  HTTPMetrics.track("POST", "/login/2fa/verify");

  try {
    const body = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Invalid input");
    }

    if (
      typeof body.tempToken !== "string" ||
      typeof body.totpCode !== "string"
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

    // const userService = await UserService.initialize();
    const user = await userService.findById(payload.userId);
    if (!user) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(ctx, "User not found");
    }

    try {
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

      const tokenPair = await tokenService.generateTokenPair(user);
      const links = {
        self: makeUserLink(user.userId, "self"),
        logout: { href: "/auth/logout", method: "POST" },
      };

      const userResponse = toUserResponse(user, links);

      const isProd = Deno.env.get("ENV") === "PROD";

      ctx.cookies.set("accessToken", tokenPair.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
      });

      ctx.cookies.set("refreshToken", tokenPair.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (longer than access token)
      });

      return Response.success(ctx, {
        user: userResponse,
      });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "login",
      operation: "with_recovery_code",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error verifying totp",
    );
  }
}

export async function withRecovery(ctx: Context) {
  HTTPMetrics.track("POST", "/login/2fa/recovery");
  try {
    const body = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Invlaid input");
    }

    if (
      typeof body.tempToken !== "string" ||
      typeof body.recoveryCode !== "string"
    ) {
      return Response.badRequest(ctx, "Invalid input");
    }

    const { tempToken, recoveryCode } = body;

    if (await RateLimiter.isRateLimited(ctx.request.ip)) {
      return Response.tooManyRequests(
        ctx,
        "Too many recovery attempts. Please try again later",
      );
    }

    const payload = await tokenService.verifyTempToken(tempToken);
    if (!payload || payload.type !== "temp" || !payload.userId) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(ctx, "Invalid or expired session");
    }

    if (!payload.recoveryAvailable) {
      await RateLimiter.trackAttempt(ctx.request.ip);
      return Response.unauthorized(
        ctx,
        "Recovery authentication not available",
      );
    }

    try {
      // const userService = await UserService.initialize();
      const user = await userService.findById(payload.userId);
      if (!user) {
        await RateLimiter.trackAttempt(ctx.request.ip);
        return Response.unauthorized(ctx, "User not found");
      }

      const isValidRecovery = await userService.useRecoveryCode(
        user.userId,
        recoveryCode,
      );
      if (!isValidRecovery) {
        await RateLimiter.trackAttempt(ctx.request.ip);
        return Response.unauthorized(ctx, "Invalid recovery code");
      }

      await RateLimiter.resetAttempts(ctx.request.ip);

      const tokenPair = await tokenService.generateTokenPair(user);
      const links = {
        self: makeUserLink(user.userId, "self"),
        logout: { href: "/auth/logout", method: "POST" },
      };

      const userResponse = toUserResponse(user, links);

      const isProd = Deno.env.get("ENV") === "PROD";

      ctx.cookies.set("accessToken", tokenPair.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
      });

      ctx.cookies.set("refreshToken", tokenPair.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (longer than access token)
      });

      return Response.success(ctx, {
        user: userResponse,
      });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "login",
      operation: "with_recovery_code",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error verifying recovery code",
    );
  }
}
