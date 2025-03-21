import { Todo } from "../models/todoModel.ts";
import { TodoRepo } from "../repositories/todoRepo.ts";
import {
  validatePriority,
  validateRecurringPattern,
  validateTags,
} from "../utils/validators.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import { MongoClient } from "mongodb";
import "@std/dotenv/load";

export class TodoService {
  private todoRepo: TodoRepo;

  constructor() {
    const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
    this.todoRepo = new TodoRepo(dbClient);
  }

  // helper functions

  isTodoValid(todo: Todo): boolean {
    if (!todo.userId) return false;

    const todoName = todo.todoName?.trim() ?? "";
    if (!todoName || todoName.length < 1 || todoName.length > 100) return false;

    const now = new Date();
    if (todo.dueDate && todo.dueDate < now) return false;
    if (todo.reminderAt && todo.reminderAt < now) return false;
    if (todo.reminderAt && todo.dueDate && todo.reminderAt > todo.dueDate) {
      return false;
    }

    if (todo.isRecurring) {
      const validatedRecurring = validateRecurringPattern(
        todo.recurringPattern,
      );
      if (!validatedRecurring) return false;
      todo.recurringPattern = validatedRecurring;
    }

    return true;
  }

  // business logic
  async createTodo(todo: Todo): Promise<Todo> {
    const timer = trackDbOperation("create", "todo");

    try {
      todo.tags = validateTags(todo.tags);
      todo.priority = validatePriority(todo.priority);
      todo.isComplete = !!todo.isComplete;

      if (!this.isTodoValid(todo)) {
        ErrorCounter.inc({
          type: "validation",
          operation: "create_todo_failed",
        });
        throw new Error("Invalid todo");
      }
      const createdTodo = await this.todoRepo.createTodo(todo);
      return createdTodo;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "create_todo_failed",
      });
      console.log("Error creating todo");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
