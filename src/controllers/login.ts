import { HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { LoginRequest } from "../models/userModel.ts";
import { toUserResponse } from "../dto/user.ts";
import { verifyPassword } from "../services/passwordService.ts";
import { tokenService } from "../services/tokenService.ts";
import { verifyTOTP } from "../utils/totp.ts";
import { UserService } from "../services/userService.ts";
import { Context } from "@oak/oak";
import * as OTPAuth from "@hectorm/otpauth";

export async function loginController(ctx: Context) {
  HTTPMetrics.track("POST", "/login");

  const loginReq = JSON.parse(await ctx.request.body.json()) as LoginRequest;
  try {
    if (!loginReq || !loginReq.username || !loginReq.password) {
      return Response.badRequest(ctx, "Invalid Input");
    }

    const userService = await UserService.initialize();

    const user = await userService.findByUsername(loginReq.username);
    if (!user) {
      return Response.unauthorized(ctx, "User doesn't exist");
    }

    const checkPassword = await verifyPassword(
      user.passwordHash,
      loginReq.password,
    );
    if (!checkPassword) {
      return Response.unauthorized(ctx, "Invalid password");
    }

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
      self: { href: `/users/${user.username}`, method: "GET" },
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
      error instanceof Error ? error.message : "Error logging in",
    );
  }
}

export async function verifyTwoFactorController(ctx: Context) {
  HTTPMetrics.track("POST", "/verify-2fa");

  try {
    const body = await ctx.request.body.json();
    if (
      !body || typeof body.tempToken !== "string" ||
      typeof body.totpCode !== "string"
    ) {
      return Response.badRequest(ctx, "Invalid input");
    }

    const { tempToken, totpCode } = body;

    if (totpCode.length !== 6) {
      return Response.badRequest(ctx, "Invalid TOTP code format");
    }

    const payload = await tokenService.verifyTempToken(tempToken);
    if (!payload || payload.type !== "verify-2fa") {
      return Response.unauthorized(ctx, "Invalid or expired 2FA session");
    }

    const userService = await UserService.initialize();
    const user = await userService.findByUsername(payload.username);
    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    const isValidTotp = verifyTOTP(
      OTPAuth.Secret.fromBase32(user.twoFactorSecret!),
      totpCode,
    );
    if (!isValidTotp) {
      return Response.unauthorized(ctx, "Invalid 2FA code");
    }

    const token = await tokenService.generateTokenPair(user);
    const links = {
      self: { href: `/users/${user.username}`, method: "GET" },
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
