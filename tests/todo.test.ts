import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  deleteTodo,
  newTodo,
  retrieveTodos,
  todoCount,
  todoStats,
  todoTagList,
  toggleComplete,
  updateTodo,
} from "../src/controllers/todo.ts";
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
  T extends string = "/api/:userId/todos/create",
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
          "http://localhost/api/123/todos/create",
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
      const ctx = createMockRouterContext<
        "/api/:userId/todos/create"
      >(
        `http://localhost/api/${testUser.userId}/todos/create`,
        { user: { userId: testUser.userId } },
        "PUT",
        {
          todoName: "Created Todo",
          description: "This is a created todo.",
          tags: ["created"],
          priority: "low",
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
        const ctx = createMockRouterContext<
          "/api/:userId/todos/create"
        >(
          `http://localhost/api/otheruser/todos/create`,
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
        "/api/:userId/todos/:todoId/update"
      >(
        `http://localhost/api/${testUser.userId}/todos/${created.todoId}/update`,
        { user: { userId: testUser.userId } },
        "PUT",
        updates,
        { userId: testUser.userId, todoId: created.todoId },
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
        const updates = {
          todoName: "Should Fail",
          description: "No ID provided.",
          tags: ["fail"],
          priority: "low",
        };
        const ctx = createMockRouterContext<
          "/api/:userId/todos/:todoId/update"
        >(
          `http://localhost/api/${testUser.userId}/todos//update`,
          { user: { userId: testUser.userId } },
          "PUT",
          updates,
          { userId: testUser.userId }, // missing todoId
        );
        await updateTodo(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "Todo ID not found");
      },
    );

    await t.step("should delete a todo for valid user", async () => {
      // First, create a todo to delete
      const todoToDelete = await todoService.createTodo(
        testUser.userId,
        "Todo to Delete",
        "Content to delete.",
        ["delete"],
        "low",
        undefined,
        undefined,
        false,
        undefined,
        undefined,
      );

      const ctx = createMockRouterContext<
        "/api/:userId/todo/:id/delete"
      >(
        `http://localhost/api/${testUser.userId}/todo/${todoToDelete.todoId}/delete`,
        { user: { userId: testUser.userId } },
        "DELETE",
        {},
        { userId: testUser.userId, id: todoToDelete.todoId },
      );

      await deleteTodo(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data, "Todo successfully deleted");

      // Confirm todo is actually deleted
      await assertRejects(
        async () =>
          await todoService.getTodo(testUser.userId, todoToDelete.todoId),
        Error,
        "Todo does not exist",
      );
    });

    await t.step("should return todo count for valid user", async () => {
      // Create some todos for the user
      await todoService.createTodo(
        testUser.userId,
        "Todo 1",
        "First todo.",
        ["count"],
        "low",
      );
      await todoService.createTodo(
        testUser.userId,
        "Todo 2",
        "Second todo.",
        ["count"],
        "medium",
      );

      const ctx = createMockRouterContext<
        "/api/:userId/todos/count"
      >(
        `http://localhost/api/${testUser.userId}/todos/count`,
        { user: { userId: testUser.userId } },
        "GET",
        {},
        { userId: testUser.userId },
      );

      await todoCount(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assertEquals(typeof responseData.data, "number");
      assert(responseData.data >= 2);
    });

    await t.step(
      "should return todo tags with counts for valid user",
      async () => {
        // Create todos with tags
        await todoService.createTodo(
          testUser.userId,
          "Tag Todo 1",
          "First tag todo.",
          ["tag1", "tag2"],
          "low",
        );
        await todoService.createTodo(
          testUser.userId,
          "Tag Todo 2",
          "Second tag todo.",
          ["tag2", "tag3"],
          "medium",
        );

        const ctx = createMockRouterContext<
          "/api/:userId/todos/tags"
        >(
          `http://localhost/api/${testUser.userId}/todos/tags`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );

        await todoTagList(ctx);

        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 200);
        assertExists(responseData.data?.tags);
        assert(Array.isArray(responseData.data.tags));
        assertExists(responseData.data.tagCount);
        assert(responseData.data.tags.includes("tag1"));
        assert(responseData.data.tags.includes("tag2"));
        assert(responseData.data.tags.includes("tag3"));
      },
    );

    await t.step("should return todo stats for valid user", async () => {
      // Create todos with various properties
      await todoService.createTodo(
        testUser.userId,
        "Stats Todo 1",
        "Pending, high priority.",
        ["stats"],
        "high",
      );
      await todoService.createTodo(
        testUser.userId,
        "Stats Todo 2",
        "Completed, low priority.",
        ["stats"],
        "low",
      );
      // Mark one as complete
      const todos = await todoService.searchTodos(testUser.userId, {});
      if (todos.length > 0) {
        todos[0].isComplete = true;
        await todoService.updateTodo(
          testUser.userId,
          todos[0].todoId,
          todos[0],
        );
      }

      const ctx = createMockRouterContext<
        "/api/:userId/todos/stats"
      >(
        `http://localhost/api/${testUser.userId}/todos/stats`,
        { user: { userId: testUser.userId } },
        "GET",
        {},
        { userId: testUser.userId },
      );

      await todoStats(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assert(typeof responseData.data.total === "number");
      assert(typeof responseData.data.completed === "number");
      assert(typeof responseData.data.pending === "number");
      assert(typeof responseData.data.highPriority === "number");
      assert(typeof responseData.data.lowPriority === "number");
    });

    await t.step(
      "should toggle completion status for a valid todo",
      async () => {
        // Create a todo to toggle
        const todoToToggle = await todoService.createTodo(
          testUser.userId,
          "Toggle Todo",
          "Toggle completion status.",
          ["toggle"],
          "medium",
        );

        // Ensure initial state is incomplete
        assertEquals(todoToToggle.isComplete, false);

        const ctx = createMockRouterContext<
          "/api/:userId/todo/:todoId/toggle"
        >(
          `http://localhost/api/${testUser.userId}/todo/${todoToToggle.todoId}/toggle`,
          { user: { userId: testUser.userId } },
          "POST",
          {},
          { userId: testUser.userId, todoId: todoToToggle.todoId },
        );

        await toggleComplete(ctx);

        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 200);
        assertExists(responseData.data);
        assertEquals(responseData.data.isComplete, true);

        // Toggle again to revert
        await toggleComplete(ctx);
        const responseData2 = ctx.response.body as ResponseData;
        assertEquals(responseData2.data.isComplete, false);
      },
    );

    await t.step(
      "should retrieve todos for valid user with filters and tags",
      async () => {
        // Create some todos for the user
        await todoService.createTodo(
          testUser.userId,
          "Retrieve Todo 1",
          "First retrieve todo.",
          ["retrieve", "work"],
          "low",
        );
        await todoService.createTodo(
          testUser.userId,
          "Retrieve Todo 2",
          "Second retrieve todo.",
          ["retrieve", "personal"],
          "medium",
        );
        // Mark one as complete for filter testing
        const todos = await todoService.searchTodos(testUser.userId, {});
        if (todos.length > 0) {
          todos[0].isComplete = true;
          await todoService.updateTodo(
            testUser.userId,
            todos[0].todoId,
            todos[0],
          );
        }

        // Retrieve all todos (should include completed if filter is set)
        const ctxAll = createMockRouterContext<
          "/api/:userId/todos"
        >(
          `http://localhost/api/${testUser.userId}/todos?includeCompleted=true`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );
        await retrieveTodos(ctxAll);
        const responseDataAll = ctxAll.response.body as ResponseData;
        assertEquals(ctxAll.response.status, 200);
        assertExists(responseDataAll.data);
        assert(Array.isArray(responseDataAll.data));
        assert(responseDataAll.data.length >= 2);

        // Retrieve only incomplete todos
        const ctxIncomplete = createMockRouterContext<
          "/api/:userId/todos"
        >(
          `http://localhost/api/${testUser.userId}/todos?includeCompleted=false`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );
        await retrieveTodos(ctxIncomplete);
        const responseDataIncomplete = ctxIncomplete.response
          .body as ResponseData;
        assertEquals(ctxIncomplete.response.status, 200);
        assertExists(responseDataIncomplete.data);
        assert(Array.isArray(responseDataIncomplete.data));
        assert(
          responseDataIncomplete.data.every((todo: any) => !todo.isComplete),
        );

        // Retrieve only todos with a due date (none in this case)
        const ctxDueDate = createMockRouterContext<
          "/api/:userId/todos"
        >(
          `http://localhost/api/${testUser.userId}/todos?onlyWithDueDate=true`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );
        await retrieveTodos(ctxDueDate);
        const responseDataDueDate = ctxDueDate.response.body as ResponseData;
        assertEquals(ctxDueDate.response.status, 200);
        assertExists(responseDataDueDate.data);
        assert(Array.isArray(responseDataDueDate.data));
        assert(
          responseDataDueDate.data.every((todo: any) =>
            todo.dueDate !== undefined && todo.dueDate !== null
          ),
        );

        // Retrieve todos by tag "work"
        const ctxTagWork = createMockRouterContext<
          "/api/:userId/todos"
        >(
          `http://localhost/api/${testUser.userId}/todos?tags=work`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );
        await retrieveTodos(ctxTagWork);
        const responseDataTagWork = ctxTagWork.response.body as ResponseData;
        assertEquals(ctxTagWork.response.status, 200);
        assertExists(responseDataTagWork.data);
        assert(Array.isArray(responseDataTagWork.data));
        assert(
          responseDataTagWork.data.every((todo: any) =>
            todo.tags && todo.tags.includes("work")
          ),
        );

        // Retrieve todos by tags "retrieve,personal"
        const ctxTagsMultiple = createMockRouterContext<
          "/api/:userId/todos"
        >(
          `http://localhost/api/${testUser.userId}/todos?tags=retrieve,personal`,
          { user: { userId: testUser.userId } },
          "GET",
          {},
          { userId: testUser.userId },
        );
        await retrieveTodos(ctxTagsMultiple);
        const responseDataTagsMultiple = ctxTagsMultiple.response
          .body as ResponseData;
        assertEquals(ctxTagsMultiple.response.status, 200);
        assertExists(responseDataTagsMultiple.data);
        assert(Array.isArray(responseDataTagsMultiple.data));
        assert(
          responseDataTagsMultiple.data.every((todo: any) =>
            todo.tags &&
            (todo.tags.includes("retrieve") || todo.tags.includes("personal"))
          ),
        );
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
