import { Todo } from "../models/todoModel.ts";
import { TodoRepo } from "../repositories/todoRepo.ts";
import {
  validatePriority,
  validateRecurringPattern,
  validateTags,
} from "../utils/validators.ts";
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
    const todoName = todo.todoName.trim() ?? "";
    if (!todoName) false;
    if (todoName.length < 1 || todoName.length > 100) false;

    todo.tags = validateTags(todo.tags);
    todo.createdAt = new Date();
    todo.updatedAt = new Date();
    todo.todoId = crypto.randomUUID();

    return true;
  }

  // business logic
  async createTodo(todo: Todo): Promise<Todo> {
    if (!todo.userId) {
      throw new Error("User ID is not valid");
    }

    if (!todo.todoName || todo.todoName.trim() === "") {
      throw new Error("Todo requires name");
    }

    const now = new Date();
    todo.createdAt = now;
    todo.updatedAt = now;
    todo.todoId = crypto.randomUUID();

    if (todo.dueDate && todo.dueDate < now) {
      throw new Error("Due date cannot be in the past");
    }

    if (todo.reminderAt && todo.reminderAt < now) {
      throw new Error("reminder cannot be in the past");
    } else if (
      todo.reminderAt && todo.dueDate && todo.reminderAt > todo.dueDate
    ) {
      throw new Error("reminder cannot be after the due date");
    }

    if (todo.isRecurring) {
      const validatedRecurring = validateRecurringPattern(
        todo.recurringPattern,
      );
      todo.recurringPattern = validatedRecurring;
    }

    if (todo.tags) {
      const validatedTags = validateTags(todo.tags);
      todo.tags = validatedTags;
    }

    if (todo.priority) {
      const validatedPriority = validatePriority(todo.priority);
      todo.priority = validatedPriority;
    }

    if (!todo.isComplete) {
      todo.isComplete = false;
    } else {
      todo.isComplete = true;
    }

    return await this.todoRepo.createTodo(todo);
  }
}
