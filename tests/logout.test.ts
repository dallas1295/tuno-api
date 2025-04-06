import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { logout } from "../src/controllers/logout.ts";
import { login } from "../src/controllers/login.ts";
import { Response } from "../src/utils/response.ts";
import { tokenService } from "../src/services/token.ts";
import { UserService } from "../src/services/user.ts";
import { User } from "../src/models/user.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";

interface ResponseData {
  data?: {
    token?: {
      accessToken: string;
      refreshToken: string;
    };
    user?: { username: string };
    requireTwoFactor?: boolean;
    tempToken?: string;
    message?: string;
  };
  error?: string;
}

const createMockContext = (
  body: unknown | null = null,
  headers: Record<string, string> = {},
): Context => ({
  request: {
    headers: new Headers(headers),
    body: body
      ? {
        value: body,
        json: () => Promise.resolve(body),
      }
      : undefined,
  },
  response: new Response(),
  state: {},
} as unknown as Context);

Deno.test({
  name: "Logout Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    let userService: UserService;
    let testUser: User;

    // Setup: Initialize MongoDB connection
    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
        userService = await UserService.initialize();
      } catch (error) {
        console.error("Connection failed aborting test");
        throw error;
      }
    });

    // Setup: Create a test user
    await t.step("setup: create test user", async () => {
      const createdUser = await userService.createUser(
        "testuser",
        "test@example.com",
        "Test123!@#$",
      );
      assertExists(createdUser);
      testUser = createdUser;
    });

    await t.step("should successfully logout with valid tokens", async () => {
      // First get valid tokens by logging in
      const loginCtx = createMockContext(
        {
          username: "testuser",
          password: "Test123!@#$",
        },
        { "Content-Type": "application/json" },
      );

      await login(loginCtx);
      const loginData = loginCtx.response.body as ResponseData;

      const ctx = createMockContext(
        null,
        {
          "Authorization": `Bearer ${loginData.data?.token?.accessToken}`,
          "Refresh-Token": loginData.data?.token?.refreshToken,
        } as Record<string, string>,
      );

      await logout(ctx);

      assertEquals(ctx.response.status, 200);
    });

    await t.step(
      "should return unauthorized when Authorization header is missing",
      async () => {
        const ctx = createMockContext(
          null,
          { "Refresh-Token": "some-token" },
        );

        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "Invalid authorization token");
      },
    );

    await t.step(
      "should return bad request when refresh token is missing",
      async () => {
        const ctx = createMockContext(
          null,
          { "Authorization": "Bearer some-token" },
        );

        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "Missing refresh token");
      },
    );

    await t.step("should handle blacklist token service errors", async () => {
      const originalBlacklistToken = tokenService.blacklistToken;

      try {
        tokenService.blacklistToken = () =>
          Promise.reject(new Error("Database error"));

        const ctx = createMockContext(
          null,
          {
            "Authorization": "Bearer some-token",
            "Refresh-Token": "refresh-token",
          },
        );

        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 500);
        assertEquals(responseData.error, "Database error");
      } finally {
        tokenService.blacklistToken = originalBlacklistToken;
      }
    });

    // Cleanup
    await t.step("cleanup: delete test user and close connection", async () => {
      if (testUser) {
        await userService.deleteUser(
          testUser.userId,
          "Test123!@#$",
          "Test123!@#$",
        );
        await closeDatabaseConnection();
      }
    });
  },
});
