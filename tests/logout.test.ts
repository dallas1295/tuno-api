import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { logout } from "../src/controllers/logout.ts";
import { login } from "../src/controllers/login.ts";
import { Response } from "../src/utils/response.ts";
import { tokenService } from "../src/services/token.ts";
import { User } from "../src/models/user.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";

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
  cookies: Record<string, string> = {},
): Context =>
  ({
    request: {
      body: body
        ? {
            value: body,
            json: () => Promise.resolve(body),
          }
        : undefined,
    },
    response: new Response(),
    state: {},
    cookies: {
      get: (name: string) => cookies[name],
      set: (name: string, value: string) => {
        cookies[name] = value;
      },
      delete: (name: string) => {
        delete cookies[name];
      },
    },
  }) as unknown as Context;

Deno.test({
  name: "Logout Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();
    let testUser: User;

    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
      } catch (error) {
        console.error("Connection failed aborting test");
        throw error;
      }
    });

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
      const loginCookies: Record<string, string> = {};
      const loginCtx = createMockContext(
        {
          username: "testuser",
          password: "Test123!@#$",
        },
        loginCookies,
      );

      await login(loginCtx);

      const ctx = createMockContext(null, {
        accessToken: loginCookies["accessToken"],
        refreshToken: loginCookies["refreshToken"],
      });

      await logout(ctx);

      assertEquals(ctx.response.status, 200);
    });

    await t.step(
      "should return unauthorized when no tokens are present",
      async () => {
        const ctx = createMockContext(null, {});
        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "Invalid authorization token");
      },
    );

    await t.step(
      "should return bad request when refresh token is missing",
      async () => {
        const ctx = createMockContext(null, { accessToken: "some-token" });
        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "Missing refresh token");
      },
    );

    await t.step("should handle blacklist token service errors", async () => {
      const originalBlacklistToken = tokenService.blacklistTokens;

      try {
        tokenService.blacklistTokens = () =>
          Promise.reject(new Error("Database error"));

        const ctx = createMockContext(null, {
          accessToken: "some-token",
          refreshToken: "refresh-token",
        });

        await logout(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 500);
        assertEquals(responseData.error, "Database error");
      } finally {
        tokenService.blacklistTokens = originalBlacklistToken;
      }
    });

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
