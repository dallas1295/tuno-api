import { assertEquals, assertExists } from "@std/assert";
import { Context } from "@oak/oak";
import {
  disableTwoFactor,
  enableTwoFactor,
  verifyTwoFactor,
} from "../src/controllers/twoFactor.ts";
import { UserService } from "../src/services/user.ts";
import { closeDatabaseConnection, connectToDb } from "../src/config/db.ts";
import { User } from "../src/models/user.ts";
import * as OTPAuth from "@hectorm/otpauth";

// Test configuration
const TEST_SECRET = "JBSWY3DPEHPK3PXP"; // Example base32 secret
const TEST_USER = {
  username: "testuser",
  email: "test@example.com",
  password: "Test123!@#$",
};

// TOTP configuration
const TOTP_CONFIG = {
  issuer: "toNotes",
  label: "toNotesAuth",
  algorithm: "SHA512",
  digits: 6,
  period: 30,
  secret: OTPAuth.Secret.fromBase32(TEST_SECRET),
};

interface ResponseData {
  data?: {
    qrCode?: string;
    uri?: string;
    verified?: boolean;
    recoveryCodes?: string[];
    disabled?: boolean;
  };
  error?: string;
}

const createMockContext = (
  body: unknown | null = null,
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
  }) as unknown as Context;

// Helper function to generate valid TOTP token
const generateValidToken = (): string => {
  const totp = new OTPAuth.TOTP(TOTP_CONFIG);
  return totp.generate();
};

Deno.test({
  name: "Enable 2FA Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    let userService: UserService;
    let testUser: User;

    // Setup: Database and test user
    await t.step(
      "setup: initialize database and create test user",
      async () => {
        try {
          const client = await connectToDb();
          await client.db().collection("users").deleteMany({});
          userService = await UserService.initialize();

          const createdUser = await userService.createUser(
            TEST_USER.username,
            TEST_USER.email,
            TEST_USER.password,
          );
          assertExists(createdUser);
          testUser = createdUser;
        } catch (error) {
          console.error("Setup failed:", error);
          throw error;
        }
      },
    );

    // Test: Enable 2FA
    await t.step("should initiate 2FA setup successfully", async () => {
      const ctx = createMockContext(null, {
        user: { userId: testUser.userId, twoFactorEnabled: false },
        session: new Map(),
      });

      await enableTwoFactor(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.qrCode, "QR code should be present");
      assertExists(responseData.data?.uri, "URI should be present");
    });

    await t.step("should fail 2FA setup with no auth token", async () => {
      const ctx = createMockContext(null, {});

      await enableTwoFactor(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 401);
      assertEquals(responseData.error, "Missing or invalid Token");
    });

    // Test: Verify 2FA
    await t.step("should verify 2FA setup successfully", async () => {
      const validToken = generateValidToken();

      // First enable 2FA
      const setupCtx = createMockContext(null, {
        user: { userId: testUser.userId },
        session: new Map(),
      });

      await enableTwoFactor(setupCtx);
      const setupSecret = await setupCtx.state.session.get("temp2faSecret");

      // Now verify 2FA - fix request body format
      const verifyCtx = createMockContext(
        {
          token: validToken.toString(), // Match the format expected in verifyTwoFactor controller
        },
        {
          user: { userId: testUser.userId },
          session: new Map([["temp2faSecret", setupSecret]]),
        },
      );

      await verifyTwoFactor(verifyCtx);
      const responseData = verifyCtx.response.body as ResponseData;

      assertEquals(verifyCtx.response.status, 200);
      assertExists(responseData.data?.verified);
      assertExists(responseData.data?.recoveryCodes);
    });

    await t.step("should fail verification without temp secret", async () => {
      const validToken = generateValidToken();

      const ctx = createMockContext(
        { token: validToken.toString() },
        {
          user: { userId: testUser.userId, twoFactorEnabled: false },
          session: new Map(),
        },
      );

      await verifyTwoFactor(ctx);
      const responseData = ctx.response.body as ResponseData;

      assertEquals(ctx.response.status, 400);
      assertEquals(responseData.error, "No 2FA setup in progress");
    });

    // Test: Disable 2FA
    await t.step("should disable 2FA successfully", async () => {
      const validToken = generateValidToken();

      // First enable 2FA
      const setupCtx = createMockContext(null, {
        user: { userId: testUser.userId },
        session: new Map(),
      });

      await enableTwoFactor(setupCtx);
      const setupSecret = await setupCtx.state.session.get("temp2faSecret");

      // Then verify 2FA
      const verifyCtx = createMockContext(
        { token: validToken.toString() },
        {
          user: { userId: testUser.userId },
          session: new Map([["temp2faSecret", setupSecret]]),
        },
      );
      await verifyTwoFactor(verifyCtx);

      // Finally disable 2FA - ensure proper body format
      const disableCtx = createMockContext(
        {
          password: TEST_USER.password,
          totp: validToken.toString(), // Ensure TOTP is string
        },
        {
          user: {
            userId: testUser.userId,
            twoFactorEnabled: true, // Add this state
          },
        },
      );

      await disableTwoFactor(disableCtx);
      const responseData = disableCtx.response.body as ResponseData;

      assertEquals(disableCtx.response.status, 200);
      assertEquals(responseData.data?.disabled, true);
    });

    await t.step(
      "should fail to disable 2FA with wrong credentials",
      async () => {
        const ctx = createMockContext(
          {
            password: "WrongPass123!@#",
            totp: "000000",
          },
          {
            user: {
              userId: testUser.userId,
              twoFactorEnabled: true,
              twoFactorSecret: TEST_SECRET,
            },
          },
        );

        await disableTwoFactor(ctx);
        const responseData = ctx.response.body as ResponseData;

        assertEquals(ctx.response.status, 400);
        assertExists(responseData.error);
      },
    );

    // Cleanup
    await t.step("cleanup: delete test user and close connection", async () => {
      try {
        const client = await connectToDb();
        const db = client.db();
        await db.collection("users").deleteMany({});
        await db.collection("sessions").deleteMany({}); // Clean up any sessions too
        await closeDatabaseConnection();
      } catch (error) {
        console.error("Error during cleanup:", error);
        throw error;
      }
    });
  },
});
