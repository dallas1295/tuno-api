import { Note } from "../models/note.ts";
import { NoteRepo } from "../repositories/noteRepo.ts";
import { trackDbOperation, ErrorCounter } from "../utils/metrics.ts";
import { MongoClient, UpdateFilter } from "npm:mongodb";

const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
const noteRepo = new NoteRepo(dbClient);

export async function togglePin(userId: string, noteId: string): Promise<void> {
  const timer = trackDbOperation("pinned", "note");

  try {
    const note = await noteRepo.getNote(userId, noteId);

    if (!note) {
      ErrorCounter.inc({
        type: "database",
        operation: "note_not_found",
      });
      throw new Error("Note not found");
    }

    let update: UpdateFilter<Note>;
    if (note.isPinned) {
      // Unpin the note
      update = {
        $set: {
          isPinned: false,
          updatedAt: new Date(),
        },
        $unset: {
          pinnedPosition: "",
        },
      };
    } else {
      // Get the current highest pinned position
      const highestPinnedPosition =
        await noteRepo.findHighestPinnedPosition(userId);
      const newPinnedPosition = highestPinnedPosition + 1;

      // Pin the note
      update = {
        $set: {
          isPinned: true,
          pinnedPosition: newPinnedPosition,
          updatedAt: new Date(),
        },
      };
    }

    await noteRepo.updateNotePinStatus(
      { noteId: noteId, userId: userId },
      update,
    );
  } catch (error) {
    ErrorCounter.inc({
      type: "database",
      operation: "toggle_pin_failed",
    });
    console.log("Failed to toggle pin");
    throw error;
  } finally {
    timer.observeDuration();
  }
}
