import { Db, IndexDescription, CreateIndexesOptions } from "npm:mongodb";
import "jsr:@std/dotenv/load";

const noteIndexes: IndexDescription[] = [
  {
    key: { userId: 1, createdAt: -1 },
    name: "user_notes_date",
  },
  { key: { userId: 1, isPinned: 1 }, name: "user_notes_pinned" },
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

const sessionIndexes: IndexDescription[] = [
  {
    key: { userId: 1, sessionId: 1 },
    name: "user_session_index",
  },
  {
    key: { expiresAt: 1 },
    name: "session_expiry_index",
  },
  {
    key: { userId: 1, isActive: 1 },
    name: "user_active_sessions",
  },
];

export async function setupIndexes(db: Db): Promise<void> {
  if (!db) {
    throw new Error("Dataase instance is nil");
  }

  const dbName = Deno.env.get("MONGO_DB") as string;
  console.log(`Setting up indexes for: ${dbName}`);

  try {
    const collections = [
      Deno.env.get("NOTES_COLLECTION") as string,
      Deno.env.get("TODOS_COLLECTION") as string,
      Deno.env.get("USERS_COLLECTION") as string,
      Deno.env.get("SESSIONS_COLLECTION") as string,
    ];
    for (const collName of collections) {
      console.log(`Ensuring collection exists: ${dbName}.${collName}`);

      try {
        await db.createCollection(collName);
      } catch (error) {
        if (!error.message.includes("NameSpaceExists")) {
          throw new Error(`Failed to create collection ${collName}`);
        }
      }
    }

    const notesCollection = db.collection(
      Deno.env.get("NOTES_COLLECTION") as string,
    );
    await notesCollection.createIndexes(noteIndexes);

    const todosCollection = db.collection(
      Deno.env.get("TODOS_COLLECTION") as string,
    );
    await todosCollection.createIndexes(todoIndexes);

    const usersCollection = db.collection(
      Deno.env.get("USERS_COLLECTION") as string,
    );
    await usersCollection.createIndexes(userIndexes);

    const sessionsCollection = db.collection(
      Deno.env.get("SESSIONS_COLLECTION") as string,
    );

    await sessionsCollection.createIndexes(sessionIndexes);

    console.log(`Successfully creatd all indexes in database: ${dbName}`);
  } catch (error) {
    console.error(`Error setting up indexes: ${error.message}`);
    throw error;
  }
}
