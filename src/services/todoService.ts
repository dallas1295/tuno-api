import { Todo } from "../models/todoModel.ts";
import { TodoRepo } from "../repositories/todoRepo.ts";
import { MongoClient, UpdateFilter } from "mongodb";
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

    const description = todo.description;
  }

  // not pushing??
}
