import { assertEquals, assertExists } from "@std/assert";
import { RouterContext } from "@oak/oak";
import { changeEmail } from "../src/controllers/changeEmail.ts";
import { Response } from "../src/utils/response.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";
import { ChangeRateLimit } from "../src/utils/rateLimiter.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";

interface ResponseData {
  data?: unknown;
  error?: string;
}

function createMockRouterContext(
  body: unknown,
  state: Record<string, unknown> = {},
  params: { userId?: string } = {},
): RouterContext<
  "/api/:userId/change-email",
  { userId: string },
  Record<string, unknown>
> {
  return {
    request: {
      body: {
        value: body,
        json: () => Promise.resolve(body),
      },
      url: new URL(
        "http://localhost/api/" + (params.userId ?? "test") + "/change-email",
      ),
    } as any,
    response: new Response(),
    state,
    params: { userId: params.userId ?? "test" } as { userId: string },
  } as unknown as RouterContext<
    "/api/:userId/change-email",
    { userId: string },
    Record<string, unknown>
  >;
}

Deno.test({
  name: "Change Email Controller Tests",
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
        "old@example.com",
        "Test123!@#$",
      );
      assertExists(createdUser);
      testUser = createdUser;
    });

    await t.step("should successfully change email", async () => {
      const ctx = createMockRouterContext(
        { newEmail: "new@example.com" },
        { user: { userId: testUser.userId } },
        { userId: testUser.userId },
      );

      await changeEmail(ctx);

      assertEquals(ctx.response.status, 200);
    });

    await t.step(
      "should return unauthorized when no user ID in context",
      async () => {
        const ctx = createMockRouterContext(
          { newEmail: "new@example.com" },
          {},
          { userId: testUser.userId },
        );

        await changeEmail(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "Missing or invalid Token");
      },
    );

    await t.step(
      "should return bad request when email is not provided",
      async () => {
        const ctx = createMockRouterContext(
          { newEmail: "" },
          { user: { userId: testUser.userId } },
          { userId: testUser.userId },
        );

        await changeEmail(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "New email not provided");
      },
    );

    await t.step(
      "should return unauthorized when user is not found",
      async () => {
        const ctx = createMockRouterContext(
          { newEmail: "new@example.com" },
          { user: { userId: "nonexistent-id" } },
          { userId: "nonexistent-id" },
        );

        await changeEmail(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step("should handle rate limit errors", async () => {
      const originalUpdateEmail = userService.updateEmail;
      userService.updateEmail = () => {
        throw new ChangeRateLimit(14);
      };

      const ctx = createMockRouterContext(
        { newEmail: "new@example.com" },
        { user: { userId: testUser.userId } },
        { userId: testUser.userId },
      );

      await changeEmail(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 429);
      assertEquals(responseData.error, "Trying to update too frequently: 14");

      userService.updateEmail = originalUpdateEmail;
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
