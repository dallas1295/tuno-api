import { DisableTwoFactorRequest } from "../models/user.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { RouterContext } from "@oak/oak";
import { userService } from "../config/serviceSetup.ts";

export async function enableTwoFactor(
  ctx: RouterContext<"/api/:userId/2fa/setup">,
) {
  HTTPMetrics.track("POST", "/2fa/setup");

  const tokenUserId = ctx.state.user?.userId;
  const paramUserId = ctx.params?.userId;

  if (!tokenUserId || !paramUserId || tokenUserId !== paramUserId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "enable_2fa_unauthorized",
    });
    return Response.unauthorized(
      ctx,
      "Unauthorized: userId mismatch or missing token",
    );
  }

  try {
    const user = await userService.findById(tokenUserId);
    if (!user) {
      return Response.unauthorized(ctx, "User not found");
    }

    if (user.twoFactorEnabled) {
      return Response.badRequest(ctx, "2FA already enabled");
    }

    const { qrCode, uri, secret } = await userService.enableTwoFactor(
      user.userId,
    );

    ctx.state.session.set("temp2faSecret", secret);
    return Response.success(ctx, { qrCode, uri });
  } catch (error) {
    if (error instanceof Error) {
      Response.badRequest(ctx, error.message);
    }
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

export async function verifyTwoFactor(
  ctx: RouterContext<"/api/:userId/2fa/verify">,
) {
  HTTPMetrics.track("POST", "/2fa/verify");

  const tokenUserId = ctx.state.user?.userId;
  const paramUserId = ctx.params?.userId;

  if (!tokenUserId || !paramUserId || tokenUserId !== paramUserId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "verify_2fa_unauthorized",
    });
    return Response.unauthorized(
      ctx,
      "Unauthorized: userId mismatch or missing token",
    );
  }

  try {
    const { token } = await ctx.request.body.json();
    const temp2faSecret = await ctx.state.session.get("temp2faSecret");

    if (!temp2faSecret) {
      return Response.badRequest(ctx, "No 2FA setup in progress");
    }

    const { verified, recoveryCodes } = await userService.verifyTwoFactor(
      tokenUserId,
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

export async function disableTwoFactor(
  ctx: RouterContext<"/api/:userId/2fa/disable">,
) {
  HTTPMetrics.track("POST", "/2fa/disable");

  const tokenUserId = ctx.state.user?.userId;
  const paramUserId = ctx.params?.userId;

  if (!tokenUserId || !paramUserId || tokenUserId !== paramUserId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "disable_2fa_unauthorized",
    });
    return Response.unauthorized(
      ctx,
      "Unauthorized: userId mismatch or missing token",
    );
  }

  try {
    const body = await ctx.request.body.json();
    const req: DisableTwoFactorRequest = {
      password: body.password?.trim(),
      totp: body.totp?.trim(),
    };

    await userService.disableTwoFactor(
      tokenUserId,
      req.totp,
      req.password,
    );

    return Response.success(ctx, { disable: true });
  } catch (error) {
    if (error instanceof Error) {
      return Response.badRequest(ctx, error.message);
    }
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
