import { Db, IndexDescription } from "mongodb";
import "@std/dotenv/load";

const noteIndexes: IndexDescription[] = [
  {
    key: { userId: 1, createdAt: -1 } as const,
    name: "user_notes_date",
  },
  { key: { userId: 1, isPinned: 1 }, name: "user_notes_pinned" } as const,
  {
    key: { userId: 1, isArchived: 1 },
    name: "user_notes_archived",
  },
  {
    key: { noteName: "text", content: "text", tags: "text" },
    name: "note_text_search",
    weights: { noteName: 10, content: 5, tags: 3 },
  },
];

const todoIndexes: IndexDescription[] = [
  {
    key: { userId: 1, createdAt: -1 },
    name: "user_todos_date",
  },
  {
    key: { userId: 1, isComplete: 1 },
    name: "user_todos_completed",
  },
  {
    key: { userId: 1, priorityLevel: 1 },
    name: "user_todos_priority",
  },
  {
    key: { userId: 1, dueDate: 1 },
    name: "user_todos_due_date",
  },
  {
    key: { userId: 1, reminderAt: 1 },
    name: "user_todos_reminder",
  },
  {
    key: { todoName: "text", description: "text", tags: "text" },
    name: "todo_text_search",
    weights: { todoName: 10, description: 5, tags: 3 },
  },
];

const userIndexes: IndexDescription[] = [
  {
    key: { username: 1 },
    name: "username_index",
    unique: true,
  },
  {
    key: { userId: 1 },
    name: "userId_index",
    unique: true,
  },
  {
    key: { email: 1 },
    name: "email_index",
    unique: true,
  },
];

export async function setupIndexes(db: Db): Promise<void> {
  if (!db) {
    throw new Error("Database instance is nil");
  }

  const dbName = Deno.env.get("MONGO_DB");
  if (!dbName) {
    throw new Error("MONGO_DB environment variable is not set");
  }

  console.log(`Setting up indexes for: ${dbName}`);

  try {
    const collections = [
      Deno.env.get("NOTE_COLLECTION"),
      Deno.env.get("TODO_COLLECTION"),
      Deno.env.get("USER_COLLECTION"),
    ].filter((name): name is string => !!name);

    for (const collName of collections) {
      console.log(`Ensuring collection exists: ${dbName}.${collName}`);

      try {
        await db.createCollection(collName);
      } catch (error: unknown) {
        // Proper error handling with type checking
        if (
          error instanceof Error && !error.message.includes("NamespaceExists")
        ) {
          throw new Error(
            `Failed to create collection ${collName}: ${error.message}`,
          );
        }
      }
    }

    const noteCollection = Deno.env.get("NOTE_COLLECTION");
    const todoCollection = Deno.env.get("TODO_COLLECTION");
    const userCollection = Deno.env.get("USER_COLLECTION");

    if (!noteCollection || !todoCollection || !userCollection) {
      throw new Error(
        "Required collection names are not set in environment variables",
      );
    }

    const notesCollection = db.collection(noteCollection);
    await notesCollection.createIndexes(noteIndexes);

    const todosCollection = db.collection(todoCollection);
    await todosCollection.createIndexes(todoIndexes);

    const usersCollection = db.collection(userCollection);
    await usersCollection.createIndexes(userIndexes);

    console.log(`Successfully created all indexes in database: ${dbName}`);
  } catch (error: unknown) {
    // Proper error handling with type checking
    const errorMessage = error instanceof Error
      ? error.message
      : "An unknown error occurred";

    console.error(`Error setting up indexes: ${errorMessage}`);
    throw error;
  }
}
