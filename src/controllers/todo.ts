import { RouterContext } from "@oak/oak";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { todoService, userService } from "../config/serviceSetup.ts";
import { CreateTodoReq, toTodoResponse } from "../dto/todo.ts";
import { makeTodoLink } from "../utils/makeLinks.ts";

export async function newTodo(ctx: RouterContext<"/api/:userId/notes/create">) {
  HTTPMetrics.track("PUT", "/todos/create");

  try {
    const userIdToken = ctx.state.user?.userId;
    if (!userIdToken) {
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
  ctx: RouterContext<"/api/:userId/note/:id/update">,
) {
  HTTPMetrics.track("PUT", "/api/:userId/note/:id/update");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const todoId = ctx.params.id;

    if (!todoId) {
      return Response.badRequest(ctx, "Note ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only update your own notes");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_notes_forbidden",
        });
        return Response.forbidden(ctx, "You can only update your own todos");
      }

      const validTodo = await todoService.getTodo(userIdFromToken, todoId);
      if (!validTodo) {
        return Response.badRequest(ctx, "Todo Id is not valid");
      }

      const updates = await ctx.request.body.json();
      if (!updates) {
        return Response.badRequest(ctx, "Todo updates note found");
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
      error instanceof Error ? error.message : "Failed to update note",
    );
  }
}
