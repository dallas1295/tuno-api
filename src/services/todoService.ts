import { Todo } from "../models/todoModel.ts";
import { TodoRepo } from "../repositories/todoRepo.ts";
import { validatePriorityLevel, validateTags } from "../utils/validators.ts";
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

  async createTodo(todo: Todo): Promise<Todo> {
    const todoName = todo.todoName.trim() ?? "";
    if (!todoName) false;
    if (todoName.length < 1 || todoName.length > 100) false;

    todo.tags = validateTags(todo.tags);
    todo.createdAt = new Date();
    todo.updatedAt = new Date();
    todo.todoId = crypto.randomUUID();
  }
}
