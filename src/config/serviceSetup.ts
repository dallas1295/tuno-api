import { connectToDb } from "./db.ts";
import { UserRepo } from "../repositories/user.ts";
import { NoteRepo } from "../repositories/note.ts";
import { TodoRepo } from "../repositories/todo.ts";
import { UserService } from "../services/user.ts";
import { NoteService } from "../services/note.ts";
import { TodoService } from "../services/todo.ts";

let userService: UserService;
let noteService: NoteService;
let todoService: TodoService;

export async function initializeServices() {
  const dbClient = await connectToDb();

  const userRepo = new UserRepo(dbClient);
  const noteRepo = new NoteRepo(dbClient);
  const todoRepo = new TodoRepo(dbClient);

  userService = new UserService(userRepo);
  noteService = new NoteService(noteRepo);
  todoService = new TodoService(todoRepo);

  return { userService, noteService, todoService };
}

export { noteService, todoService, userService };
