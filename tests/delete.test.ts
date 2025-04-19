import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { deleteUser } from "../src/controllers/delete.ts";
import { tokenService } from "../src/services/token.ts";
import { connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";

interface ResponseData {
  data?: string;
  error?: string;
}

const createMockContext = (
  body: unknown | null = null,
  state: Record<string, unknown> = {},
): Context => ({
  request: {
    body: body
      ? {
        value: body,
        json: () => Promise.resolve(body),
      }
      : undefined,
  },
  response: {
    status: 200,
    body: undefined,
    headers: new Headers(),
  },
  state,
} as unknown as Context);

Deno.test({
  name: "Delete Account Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();
    let testUser: User;
    let userTokens: { accessToken: string; refreshToken: string };

    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
      } catch (error) {
        console.error("Connection failed aborting test");
        throw error;
      }
    });

    await t.step("setup: create test user and tokens", async () => {
      // Create test user
      const createdUser = await userService.createUser(
        "testuser",
        "test@example.com",
        "Test123!@#$",
      );
      assertExists(createdUser);
      testUser = createdUser;

      // Generate tokens for the user
      userTokens = await tokenService.generateTokenPair(testUser);
      assertExists(userTokens.accessToken);
      assertExists(userTokens.refreshToken);
    });

    await t.step("verify tokens are valid before deletion", async () => {
      const accessTokenValid = await tokenService.verifyToken(
        userTokens.accessToken,
      )
        .then(() => true)
        .catch(() => false);
      const refreshTokenValid = await tokenService.verifyToken(
        userTokens.refreshToken,
      )
        .then(() => true)
        .catch(() => false);

      assertEquals(accessTokenValid, true, "Access token should be valid");
      assertEquals(refreshTokenValid, true, "Refresh token should be valid");
    });

    await t.step("should return 401 when no auth token present", async () => {
      const ctx = createMockContext({
        passwordOne: "Test123!@#$",
        passwordTwo: "Test123!@#$",
      });

      await deleteUser(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 401);
      assertEquals(responseData.error, "Missing or invalid Token");
    });

    await t.step("should return 400 when passwords don't match", async () => {
      const ctx = createMockContext(
        {
          passwordOne: "Test123!@#$",
          passwordTwo: "DifferentPass123!@#",
        },
        { user: { userId: testUser.userId } },
      );

      await deleteUser(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Passwords do not match");
    });

    await t.step(
      "should successfully delete user and blacklist tokens",
      async () => {
        // First verify tokens are not blacklisted initially
        const initialAccessBlacklist = await tokenService.isTokenBlacklisted(
          userTokens.accessToken,
        );
        const initialRefreshBlacklist = await tokenService.isTokenBlacklisted(
          userTokens.refreshToken,
        );
        assertEquals(
          initialAccessBlacklist,
          false,
          "Access token should not be blacklisted initially",
        );
        assertEquals(
          initialRefreshBlacklist,
          false,
          "Refresh token should not be blacklisted initially",
        );

        // Perform deletion
        const ctx = createMockContext(
          {
            passwordOne: "Test123!@#$",
            passwordTwo: "Test123!@#$",
          },
          {
            user: { userId: testUser.userId },
            accessToken: userTokens.accessToken,
            refreshToken: userTokens.refreshToken,
          },
        );

        await deleteUser(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 200);
        assertEquals(responseData.data, "User has been permanently deleted");

        // Verify tokens are now blacklisted
        const finalAccessBlacklist = await tokenService.isTokenBlacklisted(
          userTokens.accessToken,
        );
        const finalRefreshBlacklist = await tokenService.isTokenBlacklisted(
          userTokens.refreshToken,
        );

        assertEquals(
          finalAccessBlacklist,
          true,
          "Access token should be blacklisted after deletion",
        );
        assertEquals(
          finalRefreshBlacklist,
          true,
          "Refresh token should be blacklisted after deletion",
        );

        // Verify user no longer exists
        const deletedUser = await userService.findById(testUser.userId);
        assertEquals(deletedUser, null, "User should be deleted from database");
      },
    );
  },
});
