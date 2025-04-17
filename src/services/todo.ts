import { Priority, Todo } from "../models/todo.ts";
import { TodoRepo } from "../repositories/todo.ts";
import {
  validatePriority,
  validateRecurringPattern,
  validateTags,
} from "../utils/validators.ts";
import { ErrorCounter } from "../utils/metrics.ts";
import { connectToDb } from "../config/db.ts";

export interface TodoStats {
  total: number;
  completed: number;
  pending: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  overdue: number;
  dueToday: number;
  withReminders: number;
}

export class TodoService {
  private todoRepo!: TodoRepo;

  private constructor() {}

  static async initialize(): Promise<TodoService> {
    const service = new TodoService();
    try {
      const dbClient = await connectToDb();
      service.todoRepo = new TodoRepo(dbClient);
      return service;
    } catch (error) {
      console.error("Failed to initialize NoteService: ", error);
      throw error;
    }
  }

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

  prepTodo(todo: Todo): Todo {
    todo.tags = validateTags(todo.tags);
    todo.priority = validatePriority(todo.priority);
    todo.isComplete = !!todo.isComplete;
    return todo;
  }

  // business logic
  async createTodo(todo: Todo): Promise<Todo> {
    try {
      this.prepTodo(todo);

      if (!this.isTodoValid(todo)) {
        ErrorCounter.add(1, {
          type: "validation",
          operation: "create_todo_failed",
        });
        throw new Error("Invalid todo");
      }
      const createdTodo = await this.todoRepo.createTodo(todo);
      return createdTodo;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "create_todo_failed",
      });
      console.log("Error creating todo");
      throw error;
    }
  }

  async updateTodo(
    userId: string,
    todoId: string,
    updates: Partial<Todo>,
  ): Promise<Todo> {
    try {
      const exists = await this.todoRepo.getTodoById(todoId);
      if (!exists) {
        throw new Error("Todo not found");
      }

      const updatedTodo = this.prepTodo({ ...exists, ...updates });

      if (!this.isTodoValid(updatedTodo)) {
        ErrorCounter.add(1, {
          type: "validation",
          operation: "udpate_todo_failed",
        });
        throw new Error("Invalid todo update");
      }

      await this.todoRepo.updateTodo(userId, todoId, updatedTodo);
      return updatedTodo;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "update_todo_failed",
      });
      console.log("Error updating todo");
      throw error;
    }
  }

  async deleteTodo(userId: string, todoId: string): Promise<void> {
    const exists = await this.todoRepo.getTodoById(todoId);
    if (!exists) {
      throw new Error("Todo does not exist");
    }
    await this.todoRepo.deleteTodo(userId, todoId);
  }

  async fetchTodos(
    userId: string,
    options: {
      includeCompleted?: boolean;
      onlyWithDueDate?: boolean;
      onlyRecurring?: boolean;
    },
  ): Promise<Todo[]> {
    try {
      const {
        includeCompleted = false,
        onlyWithDueDate = false,
        onlyRecurring = false,
      } = options;

      const userTodos = await this.todoRepo.getUserTodos(userId);

      if (!userTodos) {
        return [];
      }

      let filteredTodos = userTodos;

      if (!includeCompleted) {
        filteredTodos = filteredTodos.filter((todo) => !todo.isComplete);
      }

      if (onlyWithDueDate) {
        filteredTodos = filteredTodos.filter((todo) =>
          todo.dueDate !== undefined && todo.dueDate !== null
        );
      }

      if (onlyRecurring) {
        filteredTodos = filteredTodos.filter((todo) =>
          todo.isRecurring === true
        );
      }

      const priorityValue: Record<keyof typeof Priority | "undefined", number> =
        {
          high: 3,
          medium: 2,
          low: 1,
          undefined: 0,
        };

      filteredTodos.sort((a, b) => {
        if (a.isComplete !== b.isComplete) {
          return a.isComplete ? 1 : -1;
        }

        const priorityA =
          priorityValue[a.priority as keyof typeof priorityValue] ||
          0;
        const priorityB =
          priorityValue[b.priority as keyof typeof priorityValue] ||
          0;
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }

        if (a.dueDate && b.dueDate) {
          return a.dueDate.getTime() && b.dueDate.getTime();
        } else if (a.dueDate) {
          return -1;
        } else if (b.dueDate) {
          return 1;
        }

        return 0;
      });

      return filteredTodos;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "fetch_todos_failed",
      });
      console.log("Error fetching todos");
      throw error;
    }
  }

  async countTodos(userId: string): Promise<number> {
    try {
      const todos = await this.todoRepo.getUserTodos(userId);

      if (!todos) {
        return 0;
      }

      return todos.length;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "fetch_todos_failed",
      });
      console.log("Error fetching todos");
      throw error;
    }
  }

  async getTodoTags(
    userId: string,
  ): Promise<{ tags: string[]; tagCount: number }> {
    try {
      const todos = await this.todoRepo.getUserTodos(userId);

      if (!todos || todos.length === 0) {
        return { tags: [], tagCount: 0 };
      }

      const uniqueTags = new Set<string>();

      todos.forEach((todo) => {
        if (todo.tags && Array.isArray(todo.tags)) {
          todo.tags.forEach((tag) => uniqueTags.add(tag));
        }
      });

      const tags = Array.from(uniqueTags);

      return { tags: tags, tagCount: tags.length };
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "fetch_todos_failed",
      });
      console.log("Error fetching todos");
      throw error;
    }
  }

  async toggleComplete(userId: string, todoId: string): Promise<Todo> {
    try {
      const todo = await this.todoRepo.getTodoById(todoId);
      if (!todo) {
        throw new Error("Could not find todo");
      }

      todo.isComplete = !todo.isComplete;
      todo.updatedAt = new Date();

      await this.todoRepo.updateTodo(userId, todoId, todo);

      return todo;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "toggle_complete_failed",
      });
      console.log("Error toggling complete");
      throw error;
    }
  }

  async getTodoStats(userId: string): Promise<TodoStats> {
    try {
      const todos = await this.todoRepo.getUserTodos(userId);

      if (!todos || todos.length === 0) {
        return {
          total: 0,
          completed: 0,
          pending: 0,
          highPriority: 0,
          mediumPriority: 0,
          lowPriority: 0,
          overdue: 0,
          dueToday: 0,
          withReminders: 0,
        };
      }

      const stats: TodoStats = {
        total: todos.length,
        completed: 0,
        pending: 0,
        highPriority: 0,
        mediumPriority: 0,
        lowPriority: 0,
        overdue: 0,
        dueToday: 0,
        withReminders: 0,
      };

      const now = new Date();
      const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        0,
      );

      todos.forEach((todo) => {
        if (todo.isComplete) {
          stats.completed++;
        } else {
          stats.pending++;
        }

        if (todo.priority === Priority.high) {
          stats.highPriority++;
        } else if (todo.priority === Priority.medium) {
          stats.mediumPriority++;
        } else if (todo.priority === Priority.low) {
          stats.lowPriority++;
        }

        if (!todo.isComplete && todo.dueDate) {
          if (todo.dueDate < now) {
            stats.overdue++;
          } else if (todo.dueDate <= today) {
            stats.dueToday++;
          }
        }

        if (todo.reminderAt) {
          stats.withReminders++;
        }
      });

      return stats;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "get_todo_stats_failed",
      });
      console.log("Error getting todo stats");
      throw error;
    }
  }
}
