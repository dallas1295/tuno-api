import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import { User } from "../src/models/user.ts";
import {
  login,
  withRecovery,
  withTwoFactor,
} from "../src/controllers/login.ts";
import { Response } from "../src/utils/response.ts";
import { initializeServices, userService } from "../src/config/serviceSetup.ts";
import * as OTPAuth from "@hectorm/otpauth";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";

interface ResponseData {
  data?: {
    token?: string;
    user?: { username: string };
    requireTwoFactor?: boolean;
    tempToken?: string;
    recoveryAvailable: boolean;
  };
  error?: string;
}

const createMockContext = (
  body: unknown,
  cookies: Record<string, string> = {},
): Context =>
  ({
    request: {
      body: {
        value: body,
        json: () => Promise.resolve(body),
      },
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
  name: "Login Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();

    let testUser: User;
    let totp: OTPAuth.TOTP | undefined;

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

    await t.step("should return 400 for missing credentials", async () => {
      const ctx = createMockContext({});
      await login(ctx);
      assertEquals(ctx.response.status, 400);
      assertEquals((ctx.response.body as ResponseData).error, "Invalid Input");
    });

    await t.step("should return 401 for non-existent user", async () => {
      const ctx = createMockContext({
        username: "nonexistent",
        password: "Test123!@#$",
      });
      await login(ctx);
      assertEquals(ctx.response.status, 401);
      assertEquals(
        (ctx.response.body as ResponseData).error,
        "User doesn't exist",
      );
    });

    await t.step("should return 401 for invalid password", async () => {
      const ctx = createMockContext({
        username: "testuser",
        password: "wrongpassword",
      });
      await login(ctx);
      assertEquals(ctx.response.status, 401);
      assertEquals(
        (ctx.response.body as ResponseData).error,
        "Invalid password",
      );
    });

    await t.step(
      "should return success and set cookies for valid credentials",
      async () => {
        const cookies: Record<string, string> = {};
        const ctx = createMockContext(
          {
            username: "testuser",
            password: "Test123!@#$",
          },
          cookies,
        );
        await login(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 200);
        // If your controller still returns user info, check it:
        assertExists(responseData.data?.user);
        assertEquals(responseData.data?.user?.username, "testuser");
        // Check that cookies were set
        assertExists(cookies["accessToken"]);
        assertExists(cookies["refreshToken"]);
      },
    );

    // Test 2FA flow
    await t.step("should handle 2FA enabled user", async () => {
      const twoFactorSetup = await userService.enableTwoFactor(testUser.userId);
      assertExists(twoFactorSetup);

      totp = new OTPAuth.TOTP({
        issuer: "toNotes",
        label: "toNotesAuth",
        algorithm: "SHA512",
        digits: 6,
        period: 30,
        secret: twoFactorSetup.secret,
      });
      const generatedCode = totp.generate();

      const setupResult = await userService.verifyTwoFactor(
        testUser.userId,
        totp.generate(),
        twoFactorSetup.secret,
      );
      assertExists(setupResult.recoveryCodes, "Should get recovery codes");
      const updatedUser = await userService.findById(testUser.userId);
      assertExists(updatedUser, "User should exist after 2FA setup");
      testUser = updatedUser;

      const ctx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data?.requireTwoFactor, true);
      assertExists(responseData.data?.tempToken);
      assertEquals(responseData.data?.recoveryAvailable, true);
    });

    await t.step("should verify valid 2FA code", async () => {
      assertExists(totp, "TOTP should be initialized");

      const loginCtx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponse = loginCtx.response.body as ResponseData;
      assertExists(loginResponse.data?.tempToken, "Should have temp token");

      const totpCode = totp.generate();
      const cookies: Record<string, string> = {};
      const verifyCtx = createMockContext(
        {
          tempToken: loginResponse.data?.tempToken,
          totpCode: totpCode,
        },
        cookies,
      );

      await withTwoFactor(verifyCtx);
      const verifyResponse = verifyCtx.response.body as ResponseData;

      assertEquals(verifyCtx.response.status, 200);
      assertExists(verifyResponse.data?.user);
      // Check that cookies were set
      assertExists(cookies["accessToken"]);
      assertExists(cookies["refreshToken"]);
    });

    await t.step("should reject invalid 2FA code", async () => {
      const loginCtx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponse = loginCtx.response.body as ResponseData;
      assertExists(loginResponse.data?.tempToken);

      const verifyCtx = createMockContext({
        tempToken: loginResponse.data?.tempToken,
        totpCode: "000000", // Invalid code
      });

      await withTwoFactor(verifyCtx);
      assertEquals(verifyCtx.response.status, 401);
      assertEquals(
        (verifyCtx.response.body as ResponseData).error,
        "Invalid 2FA code",
      );
    });

    await t.step("should authenticate with valid recovery code", async () => {
      const loginCtx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponse = loginCtx.response.body as ResponseData;
      assertExists(loginResponse.data?.tempToken, "Should have temp token");
      assertEquals(loginResponse.data?.recoveryAvailable, true);

      const updatedUser = await userService.findByUsername("testuser");
      assertExists(
        updatedUser?.recoveryCodes,
        "User should have recovery codes.",
      );
      const recoveryCode = updatedUser!.recoveryCodes[0];

      const cookies: Record<string, string> = {};
      const verifyCtx = createMockContext(
        {
          tempToken: loginResponse.data?.tempToken,
          recoveryCode: recoveryCode,
        },
        cookies,
      );

      await withRecovery(verifyCtx);
      const verifyResponse = verifyCtx.response.body as ResponseData;

      assertEquals(verifyCtx.response.status, 200);
      assertExists(verifyResponse.data?.user);
      // Check that cookies were set
      assertExists(cookies["accessToken"]);
      assertExists(cookies["refreshToken"]);
    });

    await t.step("should reject invalid recovery code", async () => {
      const loginCtx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponse = loginCtx.response.body as ResponseData;
      assertExists(loginResponse.data?.tempToken);

      const verifyCtx = createMockContext({
        tempToken: loginResponse.data?.tempToken,
        recoveryCode: "invalid-code",
      });

      await withRecovery(verifyCtx);
      assertEquals(verifyCtx.response.status, 401);
      assertEquals(
        (verifyCtx.response.body as ResponseData).error,
        "Invalid recovery code",
      );
    });

    await t.step("cleanup: delete test user", async () => {
      if (testUser) {
        await userService.deleteUser(
          testUser.userId,
          "Test123!@#$",
          "Test123!@#$",
          totp ? totp.generate() : undefined,
        );
      }
    });
  },
});

Deno.test({
  name: "Global teardown: close DB connection (2FA)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await closeDatabaseConnection();
  },
});
