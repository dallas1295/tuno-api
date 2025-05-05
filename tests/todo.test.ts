import { assertEquals, assertExists } from "@std/assert";
import { newTodo, updateTodo } from "../src/controllers/todo.ts";
import {
  closeDatabaseConnection,
  connectToDb,
  ensureIndexes,
} from "../src/config/db.ts";
import { RouterContext } from "@oak/oak";
import { User } from "../src/models/user.ts";
import {
  initializeServices,
  todoService,
  userService,
} from "../src/config/serviceSetup.ts";

interface ResponseData {
  data?: any;
  error?: string;
}
function createMockRouterContext<
  T extends string = "/api/:userId/notes/create",
>(
  url: string,
  state: Record<string, unknown> = {},
  method: string = "GET",
  bodyValue: any = {},
  params: Record<string, string> = {},
): RouterContext<T> {
  const urlObj = new URL(url, "http://localhost");
  // @ts-ignore - we only mock what we use
  return {
    request: {
      url: urlObj,
      searchParams: urlObj.searchParams,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      method,
      body: {
        type: "json",
        value: bodyValue,
        async json() {
          return this.value;
        },
      },
      headers: new Headers(),
    },
    response: {
      status: 0,
      body: undefined,
      headers: new Headers(),
    },
    state,
    params,
    app: undefined as any,
    cookies: undefined as any,
    send: undefined as any,
    throw: undefined as any,
    assert: undefined as any,
  } as unknown as RouterContext<T>;
}

Deno.test({
  name: "Todo Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();
    let testUser: User;
    let testTodo: any;

    await t.step("setup: initialize mongodb", async () => {
      const client = await connectToDb();
      await client.db().collection("users").deleteMany({});
      await client.db().collection("todos").deleteMany({});
      await ensureIndexes();
    });

    await t.step("setup: create test user", async () => {
      const createdUser = await userService.createUser(
        "todouser",
        "todo@example.com",
        "Todo123!@#",
      );
      assertExists(createdUser);
      testUser = createdUser;
    });
    await t.step(
      "should return unauthorized when no user in state",
      async () => {
        const ctx = createMockRouterContext(
          "http://localhost/api/123/notes/create",
          {},
          "PUT",
          {
            todoName: "Test Todo",
          },
          { userId: "123" },
        );
        await newTodo(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );
    await t.step("should create a todo for valid user", async () => {
      const ctx = createMockRouterContext(
        `http://localhost/api/${testUser.userId}/notes/create`,
        { user: { userId: testUser.userId } },
        "PUT",
        {
          todoName: "Created Todo",
          description: "This is a created todo.",
          tags: ["created"],
          priority: 1,
        },
        { userId: testUser.userId },
      );
      await newTodo(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assertEquals(responseData.data.todoName, "Created Todo");
      assertEquals(responseData.data.description, "This is a created todo.");
      assertEquals(responseData.data.tags[0], "created");
      testTodo = responseData.data;
    });
    await t.step(
      "should return forbidden if token userId and param userId do not match",
      async () => {
        const ctx = createMockRouterContext(
          `http://localhost/api/otheruser/notes/create`,
          { user: { userId: testUser.userId } },
          "PUT",
          {
            todoName: "Should Fail",
          },
          { userId: "otheruser" },
        );
        await newTodo(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 403);
        assertEquals(
          responseData.error,
          "Token userId and Context userId do not match",
        );
      },
    );
    await t.step("should update a todo for valid user", async () => {
      // First, create a todo to update
      const created = await todoService.createTodo(
        testUser.userId,
        "Todo to Update",
        "Original todo content.",
        ["original"],
        "low",
        undefined,
        undefined,
        false,
        undefined,
        undefined,
      );
      const updates = {
        todoName: "Updated Todo",
        description: "Updated content.",
        tags: ["updated"],
        priority: "high",
      };
      const ctx = createMockRouterContext<
        "/api/:userId/note/:id/update"
      >(
        `http://localhost/api/${testUser.userId}/note/${created.todoId}/update`,
        { user: { userId: testUser.userId } },
        "PUT",
        updates,
        { userId: testUser.userId, id: created.todoId },
      );

      await updateTodo(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assertEquals(responseData.data.todoName, "Updated Todo");
      assertEquals(responseData.data.description, "Updated content.");
      assertEquals(responseData.data.tags[0], "updated");
      assertEquals(responseData.data.priority, "high");
    });
    await t.step(
      "should return bad request when updating todo with missing id",
      async () => {
        const ctx = createMockRouterContext<
          "/api/:userId/note/:id/update"
        >(
          `http://localhost/api/${testUser.userId}/note//update`,
          { user: { userId: testUser.userId } },
          "PUT",
          { todoName: "Should Fail" },
          { userId: testUser.userId, id: "" },
        );
        await updateTodo(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "Note ID not found");
      },
    );

    await t.step("cleanup: delete test user and close connection", async () => {
      if (testUser) {
        await userService.deleteUser(
          testUser.userId,
          "Todo123!@#",
          "Todo123!@#",
        );
      }
      await closeDatabaseConnection();
    });
  },
});
