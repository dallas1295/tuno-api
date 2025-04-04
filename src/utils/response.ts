import { Context } from "@oak/oak";

export interface Response {
  status?: number;
  message?: string;
  error?: string;
  data?: unknown;
}

export class Response {
  static success(ctx: Context, data: unknown) {
    ctx.response.status = 200;
    ctx.response.body = {
      data,
    };
  }

  static created(ctx: Context, data: unknown) {
    ctx.response.status = 201;
    ctx.response.body = {
      message: "Resource created successfully",
      data,
    };
  }

  static badRequest(ctx: Context, message: string) {
    ctx.response.status = 400;
    ctx.response.body = {
      error: message,
    };
  }

  static unauthorized(ctx: Context, message: string) {
    ctx.response.status = 401;
    ctx.response.body = {
      error: message,
    };
  }

  static forbidden(ctx: Context, message: string) {
    ctx.response.status = 403;
    ctx.response.body = {
      error: message,
    };
  }

  static notFound(ctx: Context, message: string) {
    ctx.response.status = 404;
    ctx.response.body = {
      error: message,
    };
  }

  static tooManyRequests(ctx: Context, message: string) {
    ctx.response.status = 429;
    ctx.response.body = {
      error: message,
    };
  }

  static internalError(ctx: Context, message: string) {
    ctx.response.status = 500;
    ctx.response.body = {
      error: message,
    };
  }
}
