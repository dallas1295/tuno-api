import { assertEquals, assertExists } from "@std/assert";
import { RouterContext } from "@oak/oak";
import { getProfile } from "../src/controllers/profile.ts";
import { Response } from "../src/utils/response.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";

interface ResponseData {
  data?: {
    token?: {
      accessToken: string;
      refreshToken: string;
    };
    user?: { username: string };
    links?: {
      self: { href: string; method: string };
      changeEmail: { href: string; method: string };
      changePassword: { href: string; method: string };
      changeUsername: { href: string; method: string };
      logout: { href: string };
    };
  };
  error?: string;
}

function createMockRouterContext(
  state: Record<string, unknown> = {},
  params: { userId?: string } = {},
): RouterContext<
  "/api/:userId/profile",
  { userId: string },
  Record<string, unknown>
> {
  return {
    request: {
      url: new URL(
        "http://localhost/api/" + (params.userId ?? "test") + "/profile",
      ),
      headers: new Headers(),
    } as any,
    response: new Response(),
    state,
    params: { userId: params.userId ?? "test" } as { userId: string },
  } as unknown as RouterContext<
    "/api/:userId/profile",
    { userId: string },
    Record<string, unknown>
  >;
}

Deno.test({
  name: "Profile Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();
    let testUser: User;

    // Setup: Initialize MongoDB connection
    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
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

    await t.step(
      "should return unauthorized when no user in state",
      async () => {
        const ctx = createMockRouterContext({}, { userId: "someid" });
        await getProfile(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "Missing or invalid Token");
      },
    );

    await t.step("should return unauthorized when user not found", async () => {
      const ctx = createMockRouterContext(
        { user: { userId: "non-existent-id" } },
        { userId: "non-existent-id" },
      );
      await getProfile(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 401);
      assertEquals(responseData.error, "User not found");
    });

    await t.step("should return profile for valid user", async () => {
      const ctx = createMockRouterContext(
        { user: { userId: testUser.userId } },
        { userId: testUser.userId },
      );
      await getProfile(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.links);
      assertEquals(
        responseData.data?.links?.self.href,
        `/users/${testUser.userId}/profile`,
      );
      assertEquals(
        responseData.data?.links?.changeEmail.href,
        `/users/${testUser.userId}/email`,
      );
      assertEquals(
        responseData.data?.links?.changePassword.href,
        `/users/${testUser.userId}/password`,
      );
      assertEquals(
        responseData.data?.links?.changeUsername.href,
        `/users/${testUser.userId}/username`,
      );
      assertEquals(responseData.data?.links?.logout.href, `/api/auth/logout`);
    });

    // Cleanup: Delete test user and close connection
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
