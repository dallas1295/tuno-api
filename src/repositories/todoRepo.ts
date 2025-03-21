import { Collection, MongoClient } from "mongodb";
import { Todo } from "../models/todoModel.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import "@std/dotenv/load";

export class TodoRepo {
  private collection: Collection<Todo>;

  constructor(db: MongoClient) {
    const dbName = Deno.env.get("MONGO_DB") as string;
    const collectionName = Deno.env.get("TODO_COLLECTION") as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  async createTodo(todo: Todo): Promise<Todo> {
    const timer = trackDbOperation("insert", "todo");

    try {
      if (!todo.todoName || todo.todoName.trim() === "") {
        throw new Error("Todo requires name");
      }

      await this.collection.insertOne(todo);

      return todo; //UUID set in service before being sent to repository
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "create_todo_failed",
      });
      console.log("Failed to create todo");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getUserTodos(userId: string): Promise<Todo[] | null> {
    const timer = trackDbOperation("find", "todo");

    try {
      const findUserTodos = this.collection.find({ userId: userId });
      const userTodos: Todo[] = await findUserTodos.toArray();

      return userTodos;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_user_todos_failed",
      });
      console.log("failed to fetch user todos");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getTodoById(userId: string, todoId: string): Promise<Todo | null> {
    const timer = trackDbOperation("find", "todo");

    try {
      const findUserTodo = this.collection.findOne({
        userId: userId,
        todoId: todoId,
      });

      const userTodo = await findUserTodo;

      return userTodo;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_todo_by_id_failed",
      });
      console.log("failed to fetch user todo by id");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async updateTodo(
    userId: string,
    todoId: string,
    updates: Partial<Todo>,
  ): Promise<void> {
    const timer = trackDbOperation("update", "todo");
    try {
      const filter = {
        userId: userId,
        todoId: todoId,
      };

      const update = {
        $set: {
          todoName: updates.todoName,
          description: updates.description,
          updatedAt: new Date(),
          tags: updates.tags,
          priorityLevel: updates.priority,
          dueDate: updates.dueDate,
          reminderAt: updates.reminderAt,
          recurrencePattern: updates.recurringPattern,
        },
      };
      const result = await this.collection.updateOne(filter, update);

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "todo_not_found",
        });
        throw new Error("Todo not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "todo_update_failed",
      });
      console.log("failed to update todo");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async deleteTodo(userId: string, todoId: string): Promise<void> {
    const timer = trackDbOperation("delete", "todo");

    try {
      const filter = {
        userId: userId,
        todoId: todoId,
      };
      const result = await this.collection.deleteOne(filter);

      if (result.deletedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "todo_not_found",
        });
        throw new Error("Todo not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "delete_todo_failed",
      });
      console.log("failed to delete todo");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async countUserTodos(userId: string): Promise<number> {
    const timer = trackDbOperation("count", "todo");

    try {
      const count = await this.collection.countDocuments({ userId: userId });

      return count;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "count_user_todos_failed",
      });
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
