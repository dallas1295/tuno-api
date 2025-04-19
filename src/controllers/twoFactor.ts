import { DisableTwoFactorRequest } from "../models/user.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { Context } from "@oak/oak";
import { userService } from "../config/serviceSetup.ts";

export async function enableTwoFactor(ctx: Context) {
  HTTPMetrics.track("POST", "/2fa/setup");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "change_email_unauthorized",
      });

      return Response.unauthorized(ctx, "Missing or invalid Token");
    }

    try {
      const user = await userService.findById(userId);
      if (!user) {
        return Response.unauthorized(ctx, "User not found");
      }

      if (user.twoFactorEnabled) {
        return Response.badRequest(ctx, "2FA already enabled");
      }

      const { qrCode, uri, secret } = await userService
        .enableTwoFactor(
          user.userId,
        );

      ctx.state.session.set("temp2faSecret", secret);
      return Response.success(ctx, { qrCode, uri });
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof Error) {
          Response.badRequest(ctx, error.message);
        }
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "setup_two_factor",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error setting up 2FA",
    );
  }
}

export async function verifyTwoFactor(ctx: Context) {
  HTTPMetrics.track("POST", "/2fa/verify");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "verify_2fa_unauthorized",
      });

      return Response.unauthorized(ctx, "Missing or invalid Token");
    }

    const { token } = await ctx.request.body.json();
    const temp2faSecret = await ctx.state.session.get("temp2faSecret");

    if (!temp2faSecret) {
      return Response.badRequest(ctx, "No 2FA setup in progress");
    }

    try {
      const { verified, recoveryCodes } = await userService.verifyTwoFactor(
        userId,
        token,
        temp2faSecret,
      );

      if (!verified) {
        return Response.badRequest(ctx, "Invalid verification code");
      }

      ctx.state.session.delete("temp2faSecret");
      return Response.success(ctx, { verified: true, recoveryCodes });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "setup_two_factor",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error setting up 2FA",
    );
  }
}

export async function disableTwoFactor(ctx: Context) {
  HTTPMetrics.track("POST", "/2fa/disable");
  try {
    const user = ctx.state.user;
    if (!user) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "verify_2fa_unauthorized",
      });

      return Response.unauthorized(ctx, "Missing or invalid Token");
    }

    // verify user
    const body = await ctx.request.body.json();
    const req: DisableTwoFactorRequest = {
      password: body.password?.trim(),
      totp: body.totp.trim(),
    };

    try {
      await userService.disableTwoFactor(
        user.userId,
        req.totp,
        req.password,
      );

      return Response.success(ctx, { disable: true });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "setup_two_factor",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Error setting up 2FA",
    );
  }
}
