import { Context } from "@oak/oak";
import { HTTPMetrics } from "../utils/metrics.ts";
import { Response } from "../utils/response.ts";
import { Todo } from "../models/todo.ts";
import { todoService, userService } from "../config/serviceSetup.ts";
import { toTodoResponse } from "../dto/todo.ts";
import { makeTodoLink } from "../utils/makeLinks.ts";

export async function createTodo(ctx: Context) {
  HTTPMetrics.track("PUT", "/todos/create");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      return Response.unauthorized(ctx, "User not found");
    }

    const body: Todo = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Todo not provided");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const {
        todoName,
        dueDate,
        reminderAt,
        tags,
        priority,
        isRecurring,
        recurringPattern,
        isComplete,
      } = body;
      const createdTodo = await todoService.createTodo({
        userId,
        todoName,
        dueDate,
        reminderAt,
        tags,
        priority,
        isRecurring,
        recurringPattern,
        isComplete,
        description: body.description ?? "",
      });

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
    // Optionally add error metrics here
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to create todo",
    );
  }
}
