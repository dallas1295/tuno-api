import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { changePassword } from "../src/controllers/changePassword.ts";
import { Response } from "../src/utils/response.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";
import { ChangeRateLimit } from "../src/utils/rateLimiter.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";

interface ResponseData {
  data?: unknown;
  error?: string;
}

const createMockContext = (
  body: unknown,
  state: Record<string, unknown> = {},
): Context =>
  ({
    request: {
      body: {
        value: body,
        json: () => Promise.resolve(body),
      },
    },
    response: new Response(),
    state,
  }) as unknown as Context;

Deno.test({
  name: "Change Password Controller Tests",
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
        "OldPass123!@#",
      );
      assertExists(createdUser);
      testUser = createdUser;
    });

    await t.step("should successfully change password", async () => {
      const ctx = createMockContext(
        {
          oldPassword: "OldPass123!@#",
          newPassword: "NewPass123!@#",
        },
        { user: { userId: testUser.userId } },
      );

      await changePassword(ctx);

      assertEquals(ctx.response.status, 200);
    });

    await t.step(
      "should return unauthorized when no user ID in context",
      async () => {
        const ctx = createMockContext(
          {
            oldPassword: "OldPass123!@#",
            newPassword: "NewPass123!@#",
          },
          {},
        );

        await changePassword(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "Missing or invalid Token");
      },
    );

    await t.step(
      "should return bad request when passwords are not provided",
      async () => {
        const ctx = createMockContext(
          { oldPassword: "", newPassword: "" },
          { user: { userId: testUser.userId } },
        );

        await changePassword(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 400);
        assertEquals(
          responseData.error,
          "new or existing password not provided",
        );
      },
    );

    await t.step(
      "should return unauthorized when user is not found",
      async () => {
        const ctx = createMockContext(
          {
            oldPassword: "OldPass123!@#",
            newPassword: "NewPass123!@#",
          },
          { user: { userId: "nonexistent-id" } },
        );

        await changePassword(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step("should handle rate limit errors", async () => {
      const originalChangePassword = userService.changePassword;
      userService.changePassword = () => {
        throw new ChangeRateLimit(14);
      };

      const ctx = createMockContext(
        {
          oldPassword: "OldPass123!@#",
          newPassword: "NewPass123!@#",
        },
        { user: { userId: testUser.userId } },
      );

      await changePassword(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 429);
      assertEquals(responseData.error, "Trying to update too frequently: 14");

      userService.changePassword = originalChangePassword;
    });

    await t.step("cleanup: delete test user and close connection", async () => {
      if (testUser) {
        await userService.deleteUser(
          testUser.userId,
          "NewPass123!@#",
          "NewPass123!@#",
        );
        await closeDatabaseConnection();
      }
    });
  },
});
