import { assertSpyCall, spy, stub } from "@std/testing/mock";
import {
  disableTwoFactor,
  enableTwoFactor,
  verifyTwoFactor,
} from "../src/controllers/twoFactor.ts";
import { UserService } from "../src/services/user.ts";
import { Response } from "../src/utils/response.ts";
import type { Context } from "@oak/oak";
import type { User } from "../src/models/user.ts";

// Helper: minimal valid User object
const baseUser: User = {
  userId: "user123",
  username: "testuser",
  passwordHash: "hash",
  createdAt: new Date(),
  email: "test@example.com",
  twoFactorEnabled: false,
};

function createMockCtx(
  body: unknown = {},
  overrides: Partial<Context> = {},
): Context {
  return {
    request: {
      body: {
        value: body,
        json: () => Promise.resolve(body),
      },
      ...(overrides.request ?? {}),
    },
    state: {
      user: { userId: "user123" },
      session: {
        set: spy(async () => {}),
        get: spy(async () => "secret"),
        delete: spy(async () => {}),
      },
      ...(overrides.state ?? {}),
    },
    response: {
      status: 0,
      body: undefined,
      headers: new Headers(),
    },
    ...overrides,
  } as unknown as Context;
}

// Helper to create a full UserService stub with only the needed methods overridden
function makeUserServiceStub(methods: Partial<UserService>): UserService {
  const base: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(UserService.prototype)) {
    if (key !== "constructor") {
      base[key] = async () => undefined;
    }
  }
  return { ...base, ...methods } as UserService;
}

Deno.test("enableTwoFactor: returns unauthorized if no user", async () => {
  const ctx = createMockCtx({}, {
    state: {
      user: null,
      session: {
        set: spy(async () => {}),
        get: spy(async () => "secret"),
        delete: spy(async () => {}),
      },
    },
  });
  const unauthorized = spy(Response, "unauthorized");
  try {
    await enableTwoFactor(ctx);
    assertSpyCall(unauthorized, 0);
  } finally {
    unauthorized.restore();
  }
});

Deno.test("enableTwoFactor: returns badRequest if 2FA already enabled", async () => {
  const ctx = createMockCtx();
  const stubInit = stub(
    UserService,
    "initialize",
    async () =>
      makeUserServiceStub({
        findById: async (_userId: string) => ({
          ...baseUser,
          twoFactorEnabled: true,
        }),
      }),
  );
  const badRequest = spy(Response, "badRequest");
  try {
    await enableTwoFactor(ctx);
    assertSpyCall(badRequest, 0);
  } finally {
    stubInit.restore();
    badRequest.restore();
  }
});

Deno.test("enableTwoFactor: returns success with qrCode and uri", async () => {
  const ctx = createMockCtx();
  const stubInit = stub(
    UserService,
    "initialize",
    async () =>
      makeUserServiceStub({
        findById: async (_userId: string) => ({
          ...baseUser,
          twoFactorEnabled: false,
        }),
        enableTwoFactor: async () => ({
          qrCode: "qr",
          uri: "uri",
          secret: "secret",
        }),
      }),
  );
  const success = spy(Response, "success");
  try {
    await enableTwoFactor(ctx);
    assertSpyCall(success, 0);
  } finally {
    stubInit.restore();
    success.restore();
  }
});

Deno.test("verifyTwoFactor: returns unauthorized if no user", async () => {
  const ctx = createMockCtx({}, {
    state: {
      user: null,
      session: {
        set: spy(async () => {}),
        get: spy(async () => "secret"),
        delete: spy(async () => {}),
      },
    },
  });
  const unauthorized = spy(Response, "unauthorized");
  try {
    await verifyTwoFactor(ctx);
    assertSpyCall(unauthorized, 0);
  } finally {
    unauthorized.restore();
  }
});

Deno.test("verifyTwoFactor: returns badRequest if no temp2faSecret", async () => {
  const ctx = createMockCtx();
  ctx.state.session.get = spy(async () => null);
  const badRequest = spy(Response, "badRequest");
  try {
    await verifyTwoFactor(ctx);
    assertSpyCall(badRequest, 0);
  } finally {
    badRequest.restore();
  }
});

Deno.test("verifyTwoFactor: returns success if verified", async () => {
  const ctx = createMockCtx();
  const stubInit = stub(
    UserService,
    "initialize",
    async () =>
      makeUserServiceStub({
        verifyTwoFactor: async () => ({
          verified: true,
          recoveryCodes: ["code"],
        }),
      }),
  );
  const success = spy(Response, "success");
  try {
    await verifyTwoFactor(ctx);
    assertSpyCall(success, 0);
  } finally {
    stubInit.restore();
    success.restore();
  }
});

Deno.test("disableTwoFactor: returns unauthorized if no user", async () => {
  const ctx = createMockCtx({}, {
    state: {
      user: null,
      session: {
        set: spy(async () => {}),
        get: spy(async () => "secret"),
        delete: spy(async () => {}),
      },
    },
  });
  const unauthorized = spy(Response, "unauthorized");
  try {
    await disableTwoFactor(ctx);
    assertSpyCall(unauthorized, 0);
  } finally {
    unauthorized.restore();
  }
});

Deno.test("disableTwoFactor: returns success if disabled", async () => {
  const ctx = createMockCtx(
    { password: "testpass", totp: "123456" }, // Provide required fields
  );
  const stubInit = stub(
    UserService,
    "initialize",
    async () =>
      makeUserServiceStub({
        disableTwoFactor: async () => true,
      }),
  );
  const success = spy(Response, "success");
  try {
    await disableTwoFactor(ctx);
    assertSpyCall(success, 0);
  } finally {
    stubInit.restore();
    success.restore();
  }
});
