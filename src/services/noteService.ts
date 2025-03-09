import { Note } from "../models/noteModel.ts";
import { NoteRepo } from "../repositories/noteRepo.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import { MongoClient, UpdateFilter } from "mongodb";
import "@std/dotenv/load";

const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
const noteRepo = new NoteRepo(dbClient);

interface NoteSearchOptions {
  userId?: string;
  keywords?: string;
  tags?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  matchAll?: boolean;
  page?: number;
  pageSize?: number;
  query?: string;
}
//helper
export function isNoteValid(note: Note): boolean {
  const noteName = note.noteName?.trim() ?? "";
  if (!noteName) return false;
  if (noteName.length < 1 || noteName.length > 100) false;

  const content = note.content?.trim() ?? "";
  if (!content) return false;
  if (content.length < 1) {
    console.warn("no content");
    return false;
  }
  if (content.length > 10000) {
    console.warn("content too long");
    return false;
  }

  if (note.tags?.length) {
    const normalizedTags: string[] = note.tags
      .filter((tag): tag is string => tag !== undefined)
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "");

    note.tags = normalizedTags;

    if (normalizedTags.length > 10) {
      console.warn("too many tags");
      return false;
    }
  }

  return true;
}

export function sortNotes(
  notes: Note[],
  sortBy: string,
  sortOrder: "asc" | "desc",
): Promise<Note[]> {
  if (!sortBy) {
    sortBy = "createdAt";
  }
  const sortedNotes = [...notes].sort((a: Note, b: Note) => {
    const aVal = a[sortBy as keyof Note];
    const bVal = b[sortBy as keyof Note];
    if (
      aVal === undefined ||
      bVal === undefined ||
      (aVal === undefined && bVal === undefined)
    ) {
      return 0;
    }
    if (sortOrder === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
  return Promise.resolve(sortedNotes);
}

// business logic

export async function createNote(
  userId: string,
  noteName: string,
  content: string,
  tags?: string[],
  isPinned = false,
): Promise<Note> {
  const timer = trackDbOperation("create", "note");

  try {
    const noteId = crypto.randomUUID();

    const note: Note = {
      noteId,
      userId,
      noteName,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: tags || [],
      isPinned,
      isArchived: false,
    };

    if (!isNoteValid(note)) {
      ErrorCounter.inc({
        type: "validation",
        operation: "create_note_failed",
      });
      throw new Error("Invalid note");
    }

    const createdNote = await noteRepo.createNote(note);
    return createdNote;
  } catch (error) {
    ErrorCounter.inc({
      type: "database",
      operation: "create_note_failed",
    });
    console.log("Failed to create note");
    throw error;
  } finally {
    timer.observeDuration();
  }
}

export async function updateNote(
  userId: string,
  noteId: string,
  updates: Partial<Note>,
): Promise<Note> {
  const exists = await noteRepo.getNote(userId, noteId);
  if (!exists) {
    throw new Error("Note does not exist");
  }

  const updatedNote: Note = {
    ...exists,
    ...updates,
    updatedAt: new Date(),
  };

  updatedNote.noteId = exists.noteId;
  updatedNote.userId = exists.userId;
  updatedNote.createdAt = exists.createdAt;
  updatedNote.isArchived = exists.isArchived ?? false;
  updatedNote.pinnedPosition = updatedNote.pinnedPosition ??
    exists.pinnedPosition ?? 0;
  updatedNote.isPinned = typeof updatedNote.isPinned === "boolean"
    ? updatedNote.isPinned
    : (exists.isPinned ?? false);
  if (!isNoteValid(updatedNote)) {
    throw new Error("One or more update can't be done");
  }

  await noteRepo.updateNote(userId, noteId, updatedNote);

  return updatedNote;
}

export async function deleteNote(
  userId: string,
  noteId: string,
): Promise<void> {
  const exists = await noteRepo.getNote(userId, noteId);
  if (!exists) {
    throw new Error("Note does not exist");
  } else if (exists.isPinned) {
    throw new Error("Cannot delete pinned notes, unpin first please");
  }
  await noteRepo.deleteNote(userId, noteId);
}

export async function archiveNote(
  userId: string,
  noteId: string,
): Promise<boolean> {
  const note = await noteRepo.getNote(userId, noteId);
  if (!note) {
    throw new Error("Note does not exist");
  }

  const newArchivedStatus = !note.isArchived;

  await noteRepo.archiveNoteStatus(userId, noteId, newArchivedStatus);

  return newArchivedStatus;
}

export async function fetchUserNotes(
  userId: string,
  page = 1,
  pageSize = 15,
  sortField = "createdAt",
  sortOrder: "asc" | "desc" = "desc",
): Promise<{ notes: Note[]; totalCount: number }> {
  const timer = trackDbOperation("fetch_user_notes", "note");

  try {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const sortOrderValue = sortOrder === "asc" ? 1 : -1;

    const result = await noteRepo.getPaginatedNotes(
      userId,
      page,
      pageSize,
      sortField,
      sortOrderValue,
    );

    return result;
  } catch (error) {
    ErrorCounter.inc({
      type: "service",
      operation: "fetch_user_notes_failed",
    });
    console.error("Failed to fetch user notes", error);
    throw error;
  } finally {
    timer.observeDuration();
  }
}

export async function fetchArchivedNotes(
  userId: string,
  page = 1,
  pageSize = 15,
  sortField = "createdAt",
  sortOrder: "asc" | "desc" = "desc",
): Promise<{ notes: Note[]; totalCount: number }> {
  const timer = trackDbOperation("fetch_archived_notes", "note");

  try {
    if (!userId) {
      throw new Error("User ID is required");
    }

    const sortOrderValue = sortOrder === "asc" ? 1 : -1;

    const result = await noteRepo.getPaginatedArchivedNotes(
      userId,
      page,
      pageSize,
      sortField,
      sortOrderValue,
    );

    return result;
  } catch (error) {
    ErrorCounter.inc({
      type: "service",
      operation: "fetch_archived_notes_failed",
    });
    console.error("Failed to fetch archived notes", error);
    throw error;
  } finally {
    timer.observeDuration();
  }
}

export async function searchNotes(
  this: { noteRepo: NoteRepo },
  {
    userId,
    query,
    tags,
    page = 1,
    pageSize = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  }: NoteSearchOptions,
): Promise<{ notes: Note[]; totalCount: number }> {
  if (!userId) throw new Error("User ID is required");

  const notes = await this.noteRepo.findNotes(userId, {
    keywords: query,
    tags,
  });
  const totalCount = notes.length;

  const sortedNotes = await sortNotes(notes, sortBy, sortOrder);
  const pagedNotes = sortedNotes.slice((page - 1) * pageSize, page * pageSize);

  return { notes: pagedNotes, totalCount };
}

export async function getPinnedNotes(userId: string): Promise<Note[]> {
  const timer = trackDbOperation("get_pinned", "note");

  if (!userId || userId.trim() === "") {
    throw new Error("User ID is required");
  }

  try {
    const notes: Note[] | null = await noteRepo.getPinnedNotes(userId);
    if (!notes) {
      return [];
    }
    return notes;
  } catch (error) {
    ErrorCounter.inc({
      type: "database",
      operation: "get_pinned_failed",
    });
    console.log("Failed to get pinned notes");
    throw error;
  } finally {
    timer.observeDuration();
  }
}

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
      const highestPinnedPosition = await noteRepo.findHighestPinnedPosition(
        userId,
      );
      const newPinnedPosition = highestPinnedPosition + 1;

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

export async function updatePinPosition(
  userId: string,
  noteId: string,
  newPos: number,
): Promise<void> {
  const exists = await noteRepo.getNote(userId, noteId);
  if (!exists) {
    throw new Error("There is no note");
  } else if (!exists.isPinned) {
    throw new Error("Note is not pinned");
  }

  const pinnedNotes = await noteRepo.getPinnedNotes(userId);
  const pinnedNotesCount = pinnedNotes ? pinnedNotes.length : 0;

  if (newPos < 1 || newPos > pinnedNotesCount) {
    throw new Error("Invalid position");
  }

  return await noteRepo.updateNotePinPosition(userId, noteId, newPos);
}

export async function getNoteTags(
  userId: string,
): Promise<{ tag: string; count: number }[]> {
  const timer = trackDbOperation("get_tags", "note");

  try {
    if (!userId || userId === "") {
      throw new Error("User ID is required");
    }

    const tags = await noteRepo.getAllTags(userId);

    const tagsWithCount = await Promise.all(
      tags.map(async (tag) => {
        const count = await noteRepo.countNotesByTag(userId, tag);
        return { tag, count };
      }),
    );

    return tagsWithCount;
  } catch (error) {
    ErrorCounter.inc({
      type: "service",
      operation: "get_note_tags_failed",
    });
    console.error("failed to get note tags", error);
    throw error;
  } finally {
    timer.observeDuration();
  }
}
