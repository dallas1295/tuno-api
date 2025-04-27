import { assert, assertEquals, assertExists } from "@std/assert";
import {
  deleteNote,
  newNote,
  pinNote,
  searchNotes,
  showAllNotes,
  showNoteNames,
  showNoteTags,
  showSingleNote,
  updateNote,
  updatePinPosition,
} from "../src/controllers/note.ts";
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
import { assertRejects } from "@std/assert/rejects";

interface ResponseData {
  data?: any;
  error?: string;
}

// Generic mock for RouterContext with route type
function createMockRouterContext<
  T extends string = "/note/:id",
>(
  url: string,
  state: Record<string, unknown> = {},
  method: string = "GET",
  bodyValue: any = {},
  params: Record<string, string> = {},
): RouterContext<T> {
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
  } as unknown as RouterContext<T>;
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

    // New test for deleteNote handler
    await t.step("should delete a note for valid user", async () => {
      // First, create a note to delete
      const noteToDelete = await noteService.createNote(
        testUser.userId,
        "Note to Delete",
        "Content to delete.",
        ["delete"],
        false,
      );

      const ctx = createMockRouterContext(
        `http://localhost/notes/${noteToDelete.noteId}`,
        { user: { userId: testUser.userId } },
        "DELETE",
        {},
        { id: noteToDelete.noteId },
      );

      await deleteNote(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data, "Note successfully deleted");

      // Confirm note is actually deleted
      await assertRejects(
        async () =>
          await await noteService.getNote(
            testUser.userId,
            noteToDelete.noteId,
          ),
        Error,
        "Note not found",
      );
    });

    // New test for showNote handler
    await t.step("should return a note for valid user and noteId", async () => {
      // First, create a note to show
      const noteToShow = await noteService.createNote(
        testUser.userId,
        "Note to Show",
        "Content to show.",
        ["show"],
        false,
      );

      const ctx = createMockRouterContext(
        `http://localhost/note/${noteToShow.noteId}`,
        { user: { userId: testUser.userId } },
        "GET",
        {},
        { id: noteToShow.noteId },
      );

      await showSingleNote(ctx);

      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data.links);
      assertEquals(typeof responseData.data.links.self, "object");
    });

    await t.step(
      "should return all notes for valid user with pagination and sorting",
      async () => {
        // Create additional notes for pagination
        await noteService.createNote(
          testUser.userId,
          "Second Note",
          "Second note content.",
          ["test", "second"],
          false,
        );
        await noteService.createNote(
          testUser.userId,
          "Third Note",
          "Third note content.",
          ["test", "third"],
          false,
        );

        const ctx = createMockRouterContext(
          "http://localhost/notes/user?page=1&page_size=2&sort_by=createdAt&sort_order=desc",
          { user: { userId: testUser.userId } },
          "GET",
        );
        await showAllNotes(ctx);
        const responseData = ctx.response.body as ResponseData;
        assertEquals(ctx.response.status, 200);
        assertExists(responseData.data);
        assertExists(responseData.data.notes);
        assert(Array.isArray(responseData.data.notes));
        assert(responseData.data.notes.length <= 2);
        assertExists(responseData.data.pageCount);
      },
    );

    await t.step("should pin and unpin a note for valid user", async () => {
      // Create a note to pin
      const noteToPin = await noteService.createNote(
        testUser.userId,
        "Note to Pin",
        "Pin this note.",
        ["pin"],
        false,
      );

      const ctx = createMockRouterContext<"/note/:id/pin">(
        `http://localhost/note/${noteToPin.noteId}/pin`,
        { user: { userId: testUser.userId } },
        "PUT",
        {},
        { id: noteToPin.noteId },
      );

      await pinNote(ctx);
      let responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data.message, "Pin status toggled");

      // Unpin the note
      await pinNote(ctx);
      responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data.message, "Pin status toggled");
    });

    await t.step("should update pin position for a pinned note", async () => {
      // Create and pin two notes
      const note1 = await noteService.createNote(
        testUser.userId,
        "Pinned Note 1",
        "First pinned note.",
        ["pin"],
        false,
      );
      const note2 = await noteService.createNote(
        testUser.userId,
        "Pinned Note 2",
        "Second pinned note.",
        ["pin"],
        false,
      );

      // Pin both notes
      await noteService.togglePin(testUser.userId, note1.noteId);
      await noteService.togglePin(testUser.userId, note2.noteId);

      // Move note2 to position 1
      const ctx = createMockRouterContext<"/note/:id/pin/position">(
        `http://localhost/note/${note2.noteId}/pin/position`,
        { user: { userId: testUser.userId } },
        "PUT",
        { newPos: 1 },
        { id: note2.noteId },
      );

      await updatePinPosition(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertEquals(responseData.data.message, "Pin position updated");
    });

    await t.step("should return tags with counts for valid user", async () => {
      const ctx = createMockRouterContext(
        "http://localhost/notes/tags",
        { user: { userId: testUser.userId } },
        "GET",
      );
      await showNoteTags(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.tags);
      assert(Array.isArray(responseData.data.tags));
      // Optionally check for a known tag
      assert(
        responseData.data.tags.some((tagObj: any) => tagObj.tag === "test"),
      );
    });

    await t.step("should return note names for valid user", async () => {
      const ctx = createMockRouterContext(
        "http://localhost/notes/names",
        { user: { userId: testUser.userId } },
        "GET",
      );
      await showNoteNames(ctx);
      const responseData = ctx.response.body as ResponseData;
      assertEquals(ctx.response.status, 200);
      assertExists(responseData.data?.noteNames);
      assert(Array.isArray(responseData.data.noteNames));
      // Optionally check for a known note name
      assert(responseData.data.noteNames.includes("Test Note"));
    });

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
