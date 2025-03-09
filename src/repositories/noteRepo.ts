import {
  Collection,
  Filter,
  FindOptions,
  MongoClient,
  UpdateFilter,
} from "mongodb";
import { Note } from "../models/noteModel.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import "@std/dotenv/load";

export class NoteRepo {
  private collection: Collection<Note>;

  constructor(db: MongoClient) {
    const dbName = Deno.env.get("MONGO_DB") as string;
    const collectionName = Deno.env.get("NOTE_COLLECTION") as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  async createNote(note: Note): Promise<Note> {
    const timer = trackDbOperation("insert", "note");

    try {
      if (!note.noteName || note.noteName.trim() === "") {
        throw new Error("Notes require a name");
      }

      await this.collection.insertOne(note);
      return note;
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
  async getUserNotes(userId: string): Promise<Note[] | null> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter: Filter<Note> = { userId, isArchived: false };
      const options: FindOptions<Note> = { sort: { createdAt: -1 } };

      const cursor = this.collection.find(filter, options);
      const notes: Note[] = await cursor.toArray();

      return notes;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_user_notes_failed",
      });
      console.log("Failed to get user notes");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getNote(userId: string, noteId: string): Promise<Note | null> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter = { noteId: noteId, userId: userId };
      const note = await this.collection.findOne(filter);

      if (!note) {
        throw new Error("Note not found");
      }

      return note;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_note_failed",
      });
      console.log("Failed to get note");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async countUserNotes(userId: string): Promise<number> {
    const timer = trackDbOperation("count", "note");

    try {
      const count = await this.collection.countDocuments({
        userId: userId,
        isArchived: { $ne: true },
      });

      return count;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "count_user_notes_failed",
      });
      console.log("Failed to count user notes");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getAllTags(userId: string): Promise<string[]> {
    const timer = trackDbOperation("distinct", "note");

    try {
      const tags = await this.collection.distinct("tags", { userId: userId });

      const stringTags = tags.filter(
        (tag) => typeof tag === "string",
      ) as string[];
      return stringTags;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_all_tags_failed",
      });
      console.log("Failed to get all tags");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async updateNote(
    userId: string,
    noteId: string,
    updates: Partial<Note>,
  ): Promise<void> {
    const timer = trackDbOperation("update", "note");

    try {
      const filter = {
        userId: userId,
        todoId: noteId,
      };

      const update = {
        $set: {
          noteName: updates.noteName,
          content: updates.content,
          tags: updates.tags,
          updatedAt: new Date(),
        },
      };
      const result = await this.collection.updateOne(filter, update);

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "note_not_found",
        });
        throw new Error("Note not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "note_update_failed",
      });
      console.log("Failed to update note");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const timer = trackDbOperation("delete", "note");

    try {
      const filter = {
        userId: userId,
        noteId: noteId,
      };

      const result = await this.collection.deleteOne(filter);

      if (result.deletedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "note_not_found",
        });
        throw new Error("Note not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "delete_note_failed",
      });
      console.log("Failed to delete note");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async archiveNoteStatus(
    userId: string,
    noteId: string,
    status: boolean,
  ): Promise<void> {
    const timer = trackDbOperation("archive", "note");

    try {
      const filter = {
        userId: userId,
        noteId: noteId,
      };
      const update = {
        $set: {
          isArchived: status,
          updatedAt: new Date(),
        },
      };

      const result = await this.collection.updateOne(filter, update);

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "note_not_found",
        });
        throw new Error("Note not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "update_archive_note_failed",
      });
      console.log("Failed to change note archived status ");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async getArchivedNotes(userId: string): Promise<Note[] | null> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter: Filter<Note> = { userId, isArchived: true };
      const options: FindOptions<Note> = { sort: { createdAt: -1 } };

      const cursor = this.collection.find(filter, options);
      const notes: Note[] = await cursor.toArray();

      return notes;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_archived_notes_failed",
      });
      console.log("Failed to get archived notes");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async updateNotePinStatus(
    filter: Filter<Note>,
    update: UpdateFilter<Note>,
  ): Promise<void> {
    const timer = trackDbOperation("update", "note");

    try {
      const result = await this.collection.updateOne(filter, update);

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "note_not_found",
        });
        throw new Error("Note not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "update_note_pin_status_failed",
      });
      console.log("Failed to update note pin status");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async findHighestPinnedPosition(userId: string): Promise<number> {
    const timer = trackDbOperation("find", "note");

    try {
      const highestPinnedNote = await this.collection
        .find({ userId: userId, isPinned: true })
        .sort({ pinnedPosition: -1 })
        .limit(1)
        .toArray();

      return highestPinnedNote.length > 0 &&
          highestPinnedNote[0].pinnedPosition !== undefined
        ? highestPinnedNote[0].pinnedPosition
        : 0;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "find_highest_pinned_position_failed",
      });
      console.log("Failed to find highest pinned position");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getPinnedNotes(userId: string): Promise<Note[] | null> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter: Filter<Note> = { userId, isPinned: true };
      const options: FindOptions<Note> = { sort: { pinnedPosition: 1 } };

      const cursor = this.collection.find(filter, options);
      const notes: Note[] = await cursor.toArray();

      return notes;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_pinned_notes_failed",
      });
      console.log("Failed to get pinned notes");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async findNotes(
    userId: string,
    searchParams: {
      keywords?: string;
      tags?: string[];
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<Note[]> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter: Filter<Note> = { userId };

      if (searchParams.keywords) {
        filter.$text = { $search: searchParams.keywords };
      }

      if (searchParams.tags && searchParams.tags.length > 0) {
        filter.tags = { $in: searchParams.tags };
      }

      if (searchParams.startDate || searchParams.endDate) {
        filter.createdAt = {};
        if (searchParams.startDate) {
          filter.createdAt.$gte = searchParams.startDate;
        }
        if (searchParams.endDate) {
          filter.createdAt.$lte = searchParams.endDate;
        }
      }

      const options: FindOptions<Note> = { sort: { createdAt: -1 } };
      const cursor = this.collection.find(filter, options);
      const notes: Note[] = await cursor.toArray();

      return notes;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "find_notes_failed",
      });
      console.log("Failed to find notes");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async updateNotePinPosition(
    userId: string,
    noteId: string,
    newPos: number,
  ): Promise<void> {
    const timer = trackDbOperation("update", "note");

    try {
      const note = await this.collection.findOne({ userId, noteId });
      if (!note || !note.isPinned) {
        throw new Error("Note not found or not pinned");
      }

      const currentPos = note.pinnedPosition || 0;

      if (currentPos < newPos) {
        await this.collection.updateMany(
          {
            userId,
            isPinned: true,
            pinnedPosition: { $gt: currentPos, $lte: newPos },
          },
          { $inc: { pinnedPosition: -1 } },
        );
      } else if (currentPos > newPos) {
        await this.collection.updateMany(
          {
            userId,
            isPinned: true,
            pinnedPosition: { $gt: currentPos, $lte: newPos },
          },
          { $inc: { pinnedPosition: 1 } },
        );
      }

      await this.collection.updateOne(
        { userId, noteId },
        { $set: { pinnedPosition: newPos, updatedAt: new Date() } },
      );
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "update_pin_pos_failed",
      });
      console.log("Failed to update note pin position");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async countNotesByTag(userId: string, tag: string): Promise<number> {
    const timer = trackDbOperation("count", "note");

    try {
      const filter: Filter<Note> = { userId, tags: tag };
      const count = await this.collection.countDocuments(filter);
      return count;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "count_notes_by_tag_failed",
      });
      console.log("Failed to count notes by tag");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getSearchSuggestions(userId: string, query: string): Promise<string[]> {
    const timer = trackDbOperation("find", "note");

    try {
      const filter: Filter<Note> = {
        userId,
        $text: { $search: query },
      };
      const options: FindOptions<Note> = {
        projection: { _id: 0, title: 1 },
        limit: 10,
      };
      const cursor = this.collection.find(filter, options);
      const notes: Note[] = await cursor.toArray();
      const suggestions = notes.map((note) => note.noteName);
      return suggestions;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_search_suggestions_failed",
      });
      console.log("Failed to get search suggestions");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getPaginatedNotes(
    userId: string,
    page = 1,
    pageSize = 15,
    sortField = "createdAt",
    sortOrder: 1 | -1 = -1,
  ): Promise<{ notes: Note[]; totalCount: number }> {
    const timer = trackDbOperation("find_paginated", "note");

    try {
      const filter: Filter<Note> = { userId, isArchived: false };
      const totalCount = await this.collection.countDocuments(filter);

      const options: FindOptions<Note> = {
        sort: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };

      const notes = await this.collection.find(filter, options).toArray();

      return { notes, totalCount };
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_paginated_notes_failed",
      });
      console.error("Failed to get paginated notes", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getPaginatedArchivedNotes(
    userId: string,
    page = 1,
    pageSize = 15,
    sortField = "createdAt",
    sortOrder: 1 | -1 = -1,
  ): Promise<{ notes: Note[]; totalCount: number }> {
    const timer = trackDbOperation("find_paginated", "archived_note");

    try {
      const filter: Filter<Note> = { userId, isArchived: true };
      const totalCount = await this.collection.countDocuments(filter);

      const options: FindOptions<Note> = {
        sort: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };

      const notes = await this.collection.find(filter, options).toArray();

      return { notes, totalCount };
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_paginated_archived_notes_failed",
      });
      console.error("Failed to get paginated archived notes", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
