import { Note } from "../models/noteModel.ts";
import { NoteRepo } from "../repositories/noteRepo.ts";
import { Metrics } from "../utils/metrics.ts";
import { MongoClient, UpdateFilter } from "mongodb";
import "@std/dotenv/load";

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

export class NoteService {
  private noteRepo: NoteRepo;

  constructor() {
    const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
    this.noteRepo = new NoteRepo(dbClient);
  }

  //helper
  isNoteValid(note: Note): boolean {
    const noteName = note.noteName?.trim() ?? "";
    if (!noteName) false;
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

  sortNotes(
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

  async createNote(
    userId: string,
    noteName: string,
    content: string,
    tags?: string[],
    isPinned = false,
  ): Promise<Note> {
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

      if (!this.isNoteValid(note)) {
        Metrics.db.counters.errors.add(1, {
          type: "validation",
          operation: "create_note_failed",
        });
        throw new Error("Invalid note");
      }

      const createdNote = await this.noteRepo.createNote(note);
      return createdNote;
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "database",
        operation: "create_note_failed",
      });
      console.log("Failed to create note");
      throw error;
    }
  }

  async updateNote(
    userId: string,
    noteId: string,
    updates: Partial<Note>,
  ): Promise<Note> {
    const exists = await this.noteRepo.getNote(userId, noteId);
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
    if (!this.isNoteValid(updatedNote)) {
      throw new Error("One or more update can't be done");
    }

    await this.noteRepo.updateNote(userId, noteId, updatedNote);

    return updatedNote;
  }

  async deleteNote(
    userId: string,
    noteId: string,
  ): Promise<void> {
    const exists = await this.noteRepo.getNote(userId, noteId);
    if (!exists) {
      throw new Error("Note does not exist");
    } else if (exists.isPinned) {
      throw new Error("Cannot delete pinned notes, unpin first please");
    }
    await this.noteRepo.deleteNote(userId, noteId);
  }

  async archiveNote(
    userId: string,
    noteId: string,
  ): Promise<boolean> {
    const note = await this.noteRepo.getNote(userId, noteId);
    if (!note) {
      throw new Error("Note does not exist");
    }

    const newArchivedStatus = !note.isArchived;

    await this.noteRepo.archiveNoteStatus(userId, noteId, newArchivedStatus);

    return newArchivedStatus;
  }

  async fetchUserNotes(
    userId: string,
    page = 1,
    pageSize = 15,
    sortField = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<{ notes: Note[]; totalCount: number }> {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      const sortOrderValue = sortOrder === "asc" ? 1 : -1;

      const result = await this.noteRepo.getPaginatedNotes(
        userId,
        page,
        pageSize,
        sortField,
        sortOrderValue,
      );

      return result;
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "service",
        operation: "fetch_user_notes_failed",
      });
      console.error("Failed to fetch user notes", error);
      throw error;
    }
  }

  async fetchArchivedNotes(
    userId: string,
    page = 1,
    pageSize = 15,
    sortField = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<{ notes: Note[]; totalCount: number }> {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      const sortOrderValue = sortOrder === "asc" ? 1 : -1;

      const result = await this.noteRepo.getPaginatedArchivedNotes(
        userId,
        page,
        pageSize,
        sortField,
        sortOrderValue,
      );

      return result;
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "service",
        operation: "fetch_archived_notes_failed",
      });
      console.error("Failed to fetch archived notes", error);
      throw error;
    }
  }

  async searchNotes(
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

    const sortedNotes = await this.sortNotes(notes, sortBy, sortOrder);
    const pagedNotes = sortedNotes.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    return { notes: pagedNotes, totalCount };
  }

  async getPinnedNotes(userId: string): Promise<Note[]> {
    if (!userId || userId.trim() === "") {
      throw new Error("User ID is required");
    }

    try {
      const notes: Note[] | null = await this.noteRepo.getPinnedNotes(userId);
      if (!notes) {
        return [];
      }
      return notes;
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "database",
        operation: "get_pinned_failed",
      });
      console.log("Failed to get pinned notes");
      throw error;
    }
  }

  async togglePin(userId: string, noteId: string): Promise<void> {
    try {
      const note = await this.noteRepo.getNote(userId, noteId);

      if (!note) {
        Metrics.db.counters.errors.add(1, {
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
        const highestPinnedPosition = await this.noteRepo
          .findHighestPinnedPosition(
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

      await this.noteRepo.updateNotePinStatus(
        { noteId: noteId, userId: userId },
        update,
      );
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "database",
        operation: "toggle_pin_failed",
      });
      console.log("Failed to toggle pin");
      throw error;
    }
  }

  async updatePinPosition(
    userId: string,
    noteId: string,
    newPos: number,
  ): Promise<void> {
    const exists = await this.noteRepo.getNote(userId, noteId);
    if (!exists) {
      throw new Error("There is no note");
    } else if (!exists.isPinned) {
      throw new Error("Note is not pinned");
    }

    const pinnedNotes = await this.noteRepo.getPinnedNotes(userId);
    const pinnedNotesCount = pinnedNotes ? pinnedNotes.length : 0;

    if (newPos < 1 || newPos > pinnedNotesCount) {
      throw new Error("Invalid position");
    }

    return await this.noteRepo.updateNotePinPosition(userId, noteId, newPos);
  }

  async getNoteTags(
    userId: string,
  ): Promise<{ tag: string; count: number }[]> {
    try {
      if (!userId || userId === "") {
        throw new Error("User ID is required");
      }

      const tags = await this.noteRepo.getAllTags(userId);

      const tagsWithCount = await Promise.all(
        tags.map(async (tag) => {
          const count = await this.noteRepo.countNotesByTag(userId, tag);
          return { tag, count };
        }),
      );

      return tagsWithCount;
    } catch (error) {
      Metrics.db.counters.errors.add(1, {
        type: "service",
        operation: "get_note_tags_failed",
      });
      console.error("failed to get note tags", error);
      throw error;
    }
  }
}
