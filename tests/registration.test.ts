import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { register } from "../src/controllers/registration.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";

interface ResponseData {
  data?: {
    user?: {
      username: string;
      email: string;
    };
    links?: {
      self: { href: string; method: string };
    };
    message?: string;
  };
  error?: string;
}

const createMockContext = (
  body: unknown | null = null,
  cookies: Record<string, string> = {},
  state: Record<string, unknown> = {},
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
    response: {
      status: 200,
      body: undefined,
      headers: new Headers(),
    },
    state,
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
  name: "Registration Controller Tests",
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

    await t.step("should successfully register a new user", async () => {
      const cookies: Record<string, string> = {};
      const ctx = createMockContext(
        {
          username: "newuser",
          email: "newuser@example.com",
          password: "Test123!@#$",
        },
        cookies,
      );

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 201);
      assertExists(responseData.data?.message, "User registered successfully");
      assertExists(responseData.data?.user);
      assertExists(cookies["accessToken"]);
      assertExists(cookies["refreshToken"]);
      assertEquals(responseData.data?.user?.username, "newuser");
      assertEquals(responseData.data?.user?.email, "newuser@example.com");
    });

    await t.step("should return 400 for missing required fields", async () => {
      const ctx = createMockContext({
        username: "newuser",
        // missing email and password
      });

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Missing required fields");
    });

    await t.step("should return 400 for invalid email format", async () => {
      const ctx = createMockContext({
        username: "newuser",
        email: "invalid-email",
        password: "Test123!@#$",
      });

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Must be a valid email");
    });

    await t.step("should return 400 for weak password", async () => {
      const ctx = createMockContext({
        username: "weakpassuser",
        email: "weakpass@example.com",
        password: "weak",
      });

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(
        responseData.error,
        "Password must have at least 2 special characters, 2 numbers, and be at least 8 characters long",
      );
    });

    await t.step("should return 400 for existing username", async () => {
      const ctx = createMockContext({
        username: "testuser",
        email: "another@example.com",
        password: "Test123!@#$",
      });

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Username already exists");
    });

    await t.step("should return 400 for existing email", async () => {
      const ctx = createMockContext({
        username: "anotheruser",
        email: "test@example.com",
        password: "Test123!@#$",
      });

      await register(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Email already in use");
    });

    await t.step("cleanup: delete test data and close connection", async () => {
      await userService.deleteUser(
        testUser.userId,
        "Test123!@#$",
        "Test123!@#$",
      );
      await closeDatabaseConnection();
    });
  },
});
