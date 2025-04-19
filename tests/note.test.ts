import { assertEquals, assertExists } from "@std/assert";
import { newNote, searchNotes, updateNote } from "../src/controllers/note.ts";
import {
  closeDatabaseConnection,
  connectToDb,
  ensureIndexes,
} from "../src/config/db.ts";
import { Note } from "../src/models/note.ts";
import { RouterContext } from "@oak/oak";
import { User } from "../src/models/user.ts";
import {
  initializeServices,
  noteService,
  userService,
} from "../src/config/serviceSetup.ts";

interface ResponseData {
  data?: any;
  error?: string;
}

// Minimal mock for RouterContext<"/note/:id">
function createMockRouterContext(
  url: string,
  state: Record<string, unknown> = {},
  method: string = "GET",
  bodyValue: any = {},
  params: Record<string, string> = {},
): RouterContext<"/note/:id"> {
  const urlObj = new URL(url, "http://localhost");
  // @ts-ignore - we only mock what we use
  return {
    request: {
      url: urlObj,
      searchParams: urlObj.searchParams,
      query: Object.fromEntries(urlObj.searchParams.entries()),
      method,
      body: {
        type: "json",
        value: bodyValue,
        async json() {
          return this.value;
        },
      },
      headers: new Headers(),
    },
    response: {
      status: 0,
      body: undefined,
      headers: new Headers(),
    },
    state,
    params,
    // The following are required by RouterContext but not used in our tests/controllers
    app: undefined as any,
    cookies: undefined as any,
    send: undefined as any,
    throw: undefined as any,
    assert: undefined as any,
    // ...add more as needed if your controller accesses them
  } as unknown as RouterContext<"/note/:id">;
}

Deno.test({
  name: "Note Controller Tests",
  sanitizeResources: false,
  sanitizeOps: false,

  async fn(t) {
    await initializeServices();
    let testUser: User;
    let testNote: Note;

    await t.step("setup: initialize mongodb", async () => {
      try {
        const client = await connectToDb();
        await client.db().collection("users").deleteMany({});
        await client.db().collection("notes").deleteMany({});
        await ensureIndexes();
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
        const ctx = createMockRouterContext("http://localhost/note?q=test");
        await searchNotes(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step("should return notes for valid user", async () => {
      const ctx = createMockRouterContext(
        "http://localhost/note?q=Test",
        { user: { userId: testUser.userId } },
        "GET",
      );
      await searchNotes(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.notes);
      assertEquals(responseData.data?.notes?.[0]?.noteName, "Test Note");
    });

    await t.step("should create a note for valid user", async () => {
      const ctx = createMockRouterContext(
        "http://localhost/note",
        { user: { userId: testUser.userId } },
        "POST",
        {
          noteName: "Created Note",
          content: "This is a created note.",
          tags: ["created"],
          isPinned: false,
        },
      );
      await newNote(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assertEquals(responseData.data?.noteName, "Created Note");
      assertEquals(responseData.data?.content, "This is a created note.");
      assertEquals(responseData.data?.tags[0], "created");
    });

    await t.step(
      "should return unauthorized when creating note with no user",
      async () => {
        const ctx = createMockRouterContext(
          "http://localhost/note",
          {},
          "POST",
          {
            noteName: "No User Note",
            content: "Should not be created.",
            tags: ["fail"],
            isPinned: false,
          },
        );
        await newNote(ctx);

        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step("should update a note for valid user", async () => {
      // First, create a note to update
      const originalNote = await noteService.createNote(
        testUser.userId,
        "Note to Update",
        "Original content.",
        ["original"],
        false,
      );

      const updatedFields = {
        noteName: "Updated Note",
        content: "Updated content.",
        tags: ["updated"],
        isPinned: true,
      };

      const ctx = createMockRouterContext(
        `http://localhost/note/${originalNote.noteId}`,
        { user: { userId: testUser.userId } },
        "PUT",
        updatedFields,
        { id: originalNote.noteId },
      );

      await updateNote(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data);
      assertEquals(responseData.data?.noteName, "Updated Note");
      assertEquals(responseData.data?.content, "Updated content.");
      assertEquals(responseData.data?.tags[0], "updated");
      assertEquals(responseData.data?.isPinned, true);
    });

    await t.step(
      "should return bad request when updating note with missing id",
      async () => {
        const updatedFields = {
          noteName: "Should Fail",
          content: "No ID provided.",
          tags: ["fail"],
          isPinned: false,
        };

        const ctx = createMockRouterContext(
          "http://localhost/note/",
          { user: { userId: testUser.userId } },
          "PUT",
          updatedFields,
          {}, // no id param
        );

        await updateNote(ctx);

        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 400);
        assertEquals(responseData.error, "Note ID not found");
      },
    );

    await t.step(
      "should return unauthorized when updating note with no user",
      async () => {
        // Create a note to update
        const originalNote = await noteService.createNote(
          testUser.userId,
          "Note to Update Unauthorized",
          "Original content.",
          ["original"],
          false,
        );

        const updatedFields = {
          noteName: "Should Not Update",
          content: "No user.",
          tags: ["fail"],
          isPinned: false,
        };

        const ctx = createMockRouterContext(
          `http://localhost/note/${originalNote.noteId}`,
          {},
          "PUT",
          updatedFields,
          { id: originalNote.noteId },
        );

        await updateNote(ctx);

        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 401);
        assertEquals(responseData.error, "User not found");
      },
    );

    await t.step(
      "cleanup: delete test note and user, close connection",
      async () => {
        if (testNote) {
          try {
            await noteService.deleteNote(testUser.userId, testNote.noteId);
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
