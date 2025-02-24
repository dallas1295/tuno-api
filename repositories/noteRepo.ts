import {
  Collection,
  MongoClient,
  Filter,
  FindOptions,
  UpdateFilter,
  ObjectId,
} from "mongodb";
import { Note } from "../models/note";
import { ErrorCounter, trackDbOperation } from "../utils/metrics";
import dotenv from "dotenv";

dotenv.config();

export class NoteRepo {
  private collection: Collection<Note>;

  constructor(db: MongoClient) {
    const dbName = process.env.MONGO_DB as string;
    const collectionName = process.env.NOTE_COLLECTION as string;
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

  async archiveNote(userId: string, noteId: string): Promise<void> {
    const timer = trackDbOperation("archive", "note");

    try {
      const filter = {
        userId: userId,
        noteId: noteId,
      };
      const update = {
        $set: {
          isArchived: true,
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
        operation: "archive_note_failed",
      });
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
}
