import { Metrics } from "../utils/metrics.ts";
import { LoginRequest, User } from "../models/userModel.ts";
import { toUserResponse, UserResponse } from "../dto/user.ts";
import { Application, Context, Router } from "@oak/oak";
import { verifyPassword } from "../services/passwordService.ts";
import { tokenService } from "../services/tokenService.ts";

export async function loginController(ctx: Context) {

  try {
    const { username, password } = await ctx.request.body({ type: "json" }).value as LoginRequest;

    Metrics.http.track.request("POST", "/login")

    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid Request"}
    }

}
}
