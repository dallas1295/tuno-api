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

const createMockContext = (body: unknown): Context => ({
  request: {
    body: {
      value: body,
      json: () => Promise.resolve(body),
    },
  },
  response: new Response(),
  state: {},
} as unknown as Context);

// Test suite for login controller
Deno.test({
  name: "Login Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices(); // Ensure services are initialized before running any tests

    let testUser: User;
    let totp: OTPAuth.TOTP | undefined;
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

    await t.step("should return 400 for missing credentials", async () => {
      const ctx = createMockContext({});
      await login(ctx);
      assertEquals(ctx.response.status, 400);
      assertEquals(
        (ctx.response.body as ResponseData).error,
        "Invalid Input",
      );
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
      "should return success with token for valid credentials",
      async () => {
        const ctx = createMockContext({
          username: "testuser",
          password: "Test123!@#$",
        });
        await login(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 200);
        assertExists(responseData.data?.token);
        assertExists(responseData.data?.user);
        assertEquals(responseData.data?.user?.username, "testuser");
      },
    );
    // Test 2FA flow
    await t.step("should handle 2FA enabled user", async () => {
      // Enable 2FA for test user
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
      console.log("TEST DEBUG - TOTP Secret:", twoFactorSetup.secret);
      console.log("TEST DEBUG - Generatd TOTP Token:", generatedCode);

      // Complete 2FA setup by verifying the first TOTP code
      const setupResult = await userService.verifyTwoFactor(
        testUser.userId,
        totp.generate(),
        twoFactorSetup.secret,
      );
      assertExists(setupResult.recoveryCodes, "Should get recovery codes");
      const updatedUser = await userService.findById(testUser.userId);
      assertExists(updatedUser, "User should exist after 2FA setup");
      testUser = updatedUser;

      console.log("Updated User:", {
        twoFactorEnabled: testUser.twoFactorEnabled,
        hasRecoveryCodes: !!testUser.recoveryCodes,
        recoveryCodesLength: testUser.recoveryCodes?.length,
      });

      // Now test the login flow with 2FA
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
      // Use existing TOTP instance from previous test
      assertExists(totp, "TOTP should be initialized");

      const loginCtx = createMockContext({
        username: "testuser",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponse = loginCtx.response.body as ResponseData;
      assertExists(loginResponse.data?.tempToken, "Should have temp token");

      const totpCode = totp.generate();
      const verifyCtx = createMockContext({
        tempToken: loginResponse.data?.tempToken,
        totpCode: totpCode,
      });

      await withTwoFactor(verifyCtx);
      const verifyResponse = verifyCtx.response.body as ResponseData;

      assertEquals(verifyCtx.response.status, 200);
      assertExists(verifyResponse.data?.token);
      assertExists(verifyResponse.data?.user);
      assertEquals(verifyResponse.data?.user?.username, "testuser");
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
      // First get temp token from login
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

      const verifyCtx = createMockContext({
        tempToken: loginResponse.data?.tempToken,
        recoveryCode: recoveryCode,
      });

      await withRecovery(verifyCtx);
      const verifyResponse = verifyCtx.response.body as ResponseData;

      assertEquals(verifyCtx.response.status, 200);
      assertExists(verifyResponse.data?.token);
      assertExists(verifyResponse.data?.user);
      assertEquals(verifyResponse.data?.user?.username, "testuser");
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

    // Cleanup: delete test user
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

// Test suite for 2FA verification
Deno.test({
  name: "2FA Verification Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await initializeServices(); // Ensure services are initialized before running any tests

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

    let testUser: User;
    let twoFactorSetup: {
      qrCode: string;
      uri: string;
      secret: string;
    };
    let totp: OTPAuth.TOTP;

    // Setup: Create a test user with 2FA enabled
    await t.step("setup: create test user with 2FA", async () => {
      const createdUser = await userService.createUser(
        "testuser2fa",
        "test2fa@example.com",
        "Test123!@#$",
      );
      assertExists(createdUser);
      testUser = createdUser;

      twoFactorSetup = await userService.enableTwoFactor(testUser.userId);
      assertExists(twoFactorSetup);

      totp = new OTPAuth.TOTP({
        issuer: "toNotes_test",
        label: "toNotesAuth_test",
        algorithm: "SHA512",
        digits: 6,
        period: 30,
        secret: OTPAuth.URI.parse(twoFactorSetup.uri).secret,
      });
    });

    await t.step("should return 400 for invalid input", async () => {
      const ctx = createMockContext({});
      await withTwoFactor(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Invalid input");
    });

    await t.step("should return 400 for invalid TOTP code format", async () => {
      const ctx = createMockContext({
        tempToken: "valid-token",
        totpCode: "12345", // Invalid length
      });
      await withTwoFactor(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "Invalid TOTP code format");
    });

    await t.step("should verify valid 2FA code", async () => {
      // Debug: Verify user exists
      const dbUser = await userService.findByUsername("testuser2fa");
      console.log("DB User:", dbUser);
      assertExists(dbUser, "User should exist in database");

      // Generate a valid temp token first
      const loginCtx = createMockContext({
        username: "testuser2fa",
        password: "Test123!@#$",
      });

      await login(loginCtx);
      const loginResponseData = loginCtx.response.body as ResponseData;

      // Debug: Check login response
      console.log("Login Response:", loginResponseData);
      assertExists(loginResponseData.data?.tempToken, "Should have temp token");

      const totpCode = totp.generate();
      console.log("Generated TOTP:", totpCode);

      const verifyCtx = createMockContext({
        tempToken: loginResponseData.data?.tempToken,
        totpCode: totpCode,
      });

      await withTwoFactor(verifyCtx);
      const responseData = verifyCtx.response.body as ResponseData;

      // Debug: Check verification response
      console.log("Verify Response:", responseData);

      assertEquals(verifyCtx.response.status, 200);
      assertExists(responseData.data?.token);
      assertExists(responseData.data?.user);
    });
  },
});

// Global teardown: close DB connection after all tests (if not already closed)
Deno.test({
  name: "Global teardown: close DB connection (2FA)",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await closeDatabaseConnection();
  },
});
