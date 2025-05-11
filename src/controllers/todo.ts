import { RouterContext } from "@oak/oak";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { todoService, userService } from "../config/serviceSetup.ts";
import { CreateTodoReq, toTodoResponse } from "../dto/todo.ts";
import { makeTodoLink } from "../utils/makeLinks.ts";

export async function newTodo(ctx: RouterContext<"/api/:userId/todos/create">) {
  HTTPMetrics.track("PUT", "/todos/create");

  try {
    const userIdToken = ctx.state.user?.userId;
    if (!userIdToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "create_todo_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }
    const userIdParams = ctx.params.userId;
    if (userIdToken !== userIdParams) {
      return Response.forbidden(
        ctx,
        "Token userId and Context userId do not match",
      );
    }

    const body: CreateTodoReq = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Todo not provided");
    }

    try {
      const validUser = await userService.findById(userIdToken);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const {
        todoName,
        description = "",
        tags = [],
        priority,
        dueDate,
        reminderAt,
        isRecurring,
        recurringPattern,
        recurrenceEnd,
      } = body;
      const createdTodo = await todoService.createTodo(
        userIdToken,
        todoName,
        description,
        tags,
        priority,
        dueDate,
        reminderAt,
        isRecurring,
        recurringPattern,
        recurrenceEnd,
      );

      const links = {
        self: makeTodoLink(createdTodo.todoId, "self"),
        update: makeTodoLink(createdTodo.todoId, "update"),
        delete: makeTodoLink(createdTodo.todoId, "delete"),
      };

      const response = toTodoResponse(createdTodo, links);

      return Response.success(ctx, response);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "create_todo",
    });

    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to create todo",
    );
  }
}

export async function updateTodo(
  ctx: RouterContext<"/api/:userId/todos/:todoId/update">,
) {
  HTTPMetrics.track("PUT", "/api/:userId/todos/:todoId/update");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const todoId = ctx.params.todoId;

    if (!todoId) {
      return Response.badRequest(ctx, "Todo ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_todo_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only update your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_todos_forbidden",
        });
        return Response.forbidden(ctx, "You can only update your own todos");
      }

      const validTodo = await todoService.getTodo(validUser.userId, todoId);
      if (!validTodo) {
        return Response.notFound(ctx, "Todo does not exist");
      }

      const updates = await ctx.request.body.json();
      if (!updates) {
        return Response.badRequest(ctx, "Todo updates not found");
      }

      const updatedTodo = await todoService.updateTodo(
        validUser.userId,
        validTodo.todoId,
        updates,
      );

      const links = {
        self: makeTodoLink(updatedTodo.todoId, "self"),
        update: makeTodoLink(updatedTodo.todoId, "update"),
        delete: makeTodoLink(updatedTodo.todoId, "delete"),
      };

      const updatedTodoWithLinks = toTodoResponse(updatedTodo, links);

      return Response.success(ctx, updatedTodoWithLinks);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "update_todo",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to update todo",
    );
  }
}

export async function deleteTodo(
  ctx: RouterContext<"/api/:userId/todo/:id/delete">,
) {
  HTTPMetrics.track("DELETE", "/api/:userId/todo/:id/delete");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const todoId = ctx.params.id;

    if (!todoId) {
      return Response.badRequest(ctx, "Todo ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "delete_todo_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only delete your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_todos_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const validTodo = await todoService.getTodo(validUser.userId, todoId);
      if (!validTodo) {
        return Response.notFound(ctx, "Todo does not exist");
      }

      await todoService.deleteTodo(validUser.userId, validTodo.todoId);

      return Response.success(ctx, "Todo successfully deleted");
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "delete_todo",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to delete todo",
    );
  }
}

export async function todoCount(
  ctx: RouterContext<"/api/:userId/todos/count">,
) {
  HTTPMetrics.track("GET", "/api/:userId/todos/count");
  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "count_todos_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only access your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        return Response.unauthorized(ctx, "You are not logged in");
      }

      const todoCount = await todoService.countTodos(validUser.userId);

      return Response.success(ctx, todoCount);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "count_todo",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to count todos",
    );
  }
}

export async function todoTagList(
  ctx: RouterContext<"/api/:userId/todos/tags">,
) {
  HTTPMetrics.track("GET", "/api/:userId/todos/tags");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "todo_tags_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only access your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        return Response.unauthorized(ctx, "You are not logged in");
      }

      const todoTags = await todoService.getTodoTags(validUser.userId);

      return Response.success(ctx, todoTags);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "todo_tags",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to list todo tags",
    );
  }
}
export async function todoStats(
  ctx: RouterContext<"/api/:userId/todos/stats">,
) {
  HTTPMetrics.track("GET", "/api/:userId/todos/stats");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "todo_stats_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only access your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        return Response.unauthorized(ctx, "You are not logged in");
      }

      const todoStats = await todoService.getTodoStats(validUser.userId);

      return Response.success(ctx, todoStats);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "todo_stats",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to fetch todo stats",
    );
  }
}

export async function toggleComplete(
  ctx: RouterContext<"/api/:userId/todo/:todoId/toggle">,
) {
  HTTPMetrics.track("POST", "/api/:userId/todo/:todoId/toggle");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const todoId = ctx.params.todoId;

    if (!todoId) {
      return Response.badRequest(ctx, "Todo ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "todo_stats_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only access your own todos");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_todos_forbidden",
        });
        return Response.forbidden(ctx, "You can only update your own todos");
      }

      const validTodo = await todoService.getTodo(validUser.userId, todoId);
      if (!validTodo) {
        return Response.notFound(ctx, "Todo does not exist");
      }

      const toggledTodo = await todoService.toggleComplete(
        validUser.userId,
        validTodo.todoId,
      );

      return Response.success(ctx, toggledTodo);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "toggle_completion",
    });
    return Response.internalError(
      ctx,
      error instanceof Error
        ? error.message
        : "Failed to change todo completion status",
    );
  }
}

export async function retrieveTodos(
  ctx: RouterContext<"/api/:userId/todos">,
) {
  HTTPMetrics.track("GET", "/api/:userId/todos");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "fetch_todos_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only access your own todos");
    }

    const url = ctx.request.url;
    const includeCompleted =
      url.searchParams.get("includeCompleted") === "true";
    const onlyWithDueDate = url.searchParams.get("onlyWithDueDate") === "true";
    const onlyRecurring = url.searchParams.get("onlyRecurring") === "true";
    const tagsParam = url.searchParams.get("tags");
    const tags = tagsParam
      ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder =
      (url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc") as
        | "asc"
        | "desc";

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        return Response.unauthorized(ctx, "You are not logged in");
      }

      const todos = await todoService.searchTodos(validUser.userId, {
        includeCompleted,
        onlyWithDueDate,
        onlyRecurring,
        tags,
        sortBy,
        sortOrder,
      });

      return Response.success(ctx, todos);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "fetch_todos",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to fetch todos",
    );
  }
}
