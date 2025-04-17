import { assertEquals, assertExists } from "@std/assert";
import { searchNotes } from "../src/controllers/note.ts";
import { NoteService } from "../src/services/note.ts";
import {
  closeDatabaseConnection,
  connectToDb,
  ensureIndexes,
} from "../src/config/db.ts";
import { Note } from "../src/models/note.ts";
import { Context } from "@oak/oak";
import { UserService } from "../src/services/user.ts";
import { User } from "../src/models/user.ts";

interface ResponseData {
  data?: {
    notes?: Note[];
    totalCount?: number;
    pageCount?: number;
    page?: number;
    links?: Record<string, { href: string; method: string }>;
  };
  error?: string;
}

const createMockContext = (
  url: string,
  state: Record<string, unknown> = {},
): Context => {
  const urlObj = new URL(url, "http://localhost");
  return {
    request: {
      url: urlObj,
      searchParams: urlObj.searchParams,
      query: Object.fromEntries(urlObj.searchParams.entries()),
    },
    response: {
      status: 0,
      body: undefined,
      headers: new Headers(),
    },
    state,
  } as unknown as Context;
};

Deno.test({
  name: "Note Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    let userService: UserService;
    let noteService: NoteService;
    let testUser: User;
    let testNote: Note;

    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
        await client.db().collection("notes").deleteMany({});
        await ensureIndexes();
        userService = await UserService.initialize();
        noteService = await NoteService.initialize();
      } catch (error) {
        console.error("Connection failed aborting test");
        throw error;
      }
    });

    await t.step("setup: create test user", async () => {
      const createdUser = await userService.createUser(
        "testuser",
        "test@example.com",
        "Test123!@#$",
      );
      assertExists(createdUser);
      testUser = createdUser;
    });

    await t.step("setup: create test note", async () => {
      testNote = await noteService.createNote(
        testUser.userId,
        "Test Note",
        "This is a test note.",
        ["test"],
      );
      assertExists(testNote);
    });

    await t.step(
      "should return unauthorized when no user in state",
      async () => {
        const ctx = createMockContext("http://localhost/note?q=test");
        await searchNotes(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step("should return notes for valid user", async () => {
      const ctx = createMockContext("http://localhost/note?q=Test", {
        user: { userId: testUser.userId },
      });
      await searchNotes(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.notes);
      assertEquals(responseData.data?.notes?.[0]?.noteName, "Test Note");
    });

    await t.step(
      "cleanup: delete test note and user, close connection",
      async () => {
        if (testNote) {
          try {
            await noteService.deleteNote(testNote.noteId, testUser.userId);
          } catch (error) {
            if (
              !(error instanceof Error) || error.message !== "Note not found"
            ) throw error;
          }
        }
        if (testUser) {
          await userService.deleteUser(
            testUser.userId,
            "Test123!@#$",
            "Test123!@#$",
          );
        }
        await closeDatabaseConnection();
      },
    );
  },
});
