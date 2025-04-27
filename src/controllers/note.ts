import { newNotesPageResponse, NoteLink, toNoteResponse } from "../dto/note.ts";
import { Response } from "../utils/response.ts";
import { Note } from "../models/note.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { noteService, userService } from "../config/serviceSetup.ts";
import { Context, RouterContext } from "@oak/oak";
import { makeNoteLink } from "../utils/makeLinks.ts";

export async function searchNotes(ctx: Context) {
  HTTPMetrics.track("GET", "/notes/search");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "search_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    const validUser = await userService.findById(userId);
    if (!validUser) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "search_notes_forbidden",
      });
      return Response.forbidden(ctx, "User ID does not exist");
    }

    const url = ctx.request.url;
    const query = url.searchParams.get("q") || "";
    const tags = url.searchParams.getAll("tags");
    const sortBy = url.searchParams.get("sort_by") || "createdAt";
    const sortOrder = (url.searchParams.get("sort_order") as "asc" | "desc") ||
      "desc";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") || "10", 10);

    try {
      const { notes, totalCount } = await noteService.searchNotes({
        userId,
        query,
        tags,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });

      const pageCount = Math.ceil(totalCount / pageSize);
      const baseURL = `${url.protocol}//${url.host}`;

      const links: { [key: string]: NoteLink } = {
        self: { href: `${baseURL}/note`, method: "GET" },
        create: { href: `${baseURL}/note`, method: "POST" },
      };

      if (page < pageCount) {
        let nextPageURL = `${baseURL}/note?page=${
          page + 1
        }&page_size=${pageSize}`;
        if (query) nextPageURL += `&q=${encodeURIComponent(query)}`;
        links["next"] = { href: nextPageURL, method: "GET" };
      }
      if (page > 1) {
        let prevPageURL = `${baseURL}/note?page=${
          page - 1
        }&page_size=${pageSize}`;
        if (query) prevPageURL += `&q=${encodeURIComponent(query)}`;
        links["prev"] = { href: prevPageURL, method: "GET" };
      }

      const response = newNotesPageResponse(
        notes,
        totalCount,
        pageCount,
        page,
        links,
        (note) => ({
          self: makeNoteLink(note.noteId, "self"),
          update: makeNoteLink(note.noteId, "update"),
          delete: makeNoteLink(note.noteId, "delete"),
        }),
      );

      return Response.success(ctx, response);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "search_notes",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to search notes",
    );
  }
}

export async function newNote(ctx: Context) {
  HTTPMetrics.track("PUT", "/notes/create");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      return Response.unauthorized(ctx, "User not found");
    }

    const body: Note = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Note not provided");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const { noteName, content, tags, isPinned } = await ctx.request.body
        .json();
      const createdNote = await noteService.createNote(
        userId,
        noteName,
        content,
        tags,
        isPinned,
      );

      const links = {
        self: makeNoteLink(createdNote.noteId, "self"),
        update: makeNoteLink(createdNote.noteId, "update"),
        delete: makeNoteLink(createdNote.noteId, "delete"),
      };

      const response = toNoteResponse(createdNote, links);

      return Response.success(ctx, response);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "create_note",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to create note",
    );
  }
}

export async function updateNote(ctx: RouterContext<"/note/:id">) {
  HTTPMetrics.track("PUT", "/note/:id/update");

  try {
    const noteId = ctx.params.id;
    const userId = ctx.state.user?.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }

    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_notes_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const validNote = await noteService.getNote(validUser.userId, noteId);

      const updates = await ctx.request.body.json();
      if (!updates) {
        return Response.badRequest(ctx, "Note updates not found");
      }

      const updatedNote = await noteService.updateNote(
        validUser.userId,
        validNote.noteId,
        updates,
      );

      const links = {
        self: makeNoteLink(updatedNote.noteId, "self"),
        update: makeNoteLink(updatedNote.noteId, "update"),
        delete: makeNoteLink(updatedNote.noteId, "delete"),
      };

      const updatedNoteWithLinks = toNoteResponse(updatedNote, links);

      return Response.success(ctx, updatedNoteWithLinks);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "update_note",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to update note",
    );
  }
}

export async function deleteNote(ctx: RouterContext<"/note/:id">) {
  HTTPMetrics.track("DELETE", "note/:id/delete");

  try {
    const noteId = ctx.params.id;
    const userId = ctx.state.user?.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }

    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_notes_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const validNote = await noteService.getNote(userId, noteId);
      if (!validNote) {
        return Response.notFound(ctx, "Note does not exist");
      }

      await noteService.deleteNote(validUser.userId, validNote.noteId);

      return Response.success(ctx, "Note successfully deleted");
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "delete_note",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to delete note",
    );
  }
}

export async function showSingleNote(ctx: RouterContext<"/note/:id">) {
  HTTPMetrics.track("GET", "note/:id");

  const userId = ctx.state.user?.userId;
  if (!userId) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "search_notes_unauthorized",
    });
    return Response.unauthorized(ctx, "Missing or invalid token");
  }

  try {
    const noteId = ctx.params.id;
    if (!noteId) {
      return Response.badRequest(ctx, "Note id not provided");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        return Response.unauthorized(ctx, "User not found");
      }

      const note = await noteService.getNote(validUser.userId, noteId);
      if (!note) {
        return Response.notFound(ctx, "Cannot find note");
      }

      const links = {
        self: makeNoteLink(note.noteId, "self"),
        update: makeNoteLink(note.noteId, "update"),
        delete: makeNoteLink(note.noteId, "delete"),
      };

      const response = toNoteResponse(note, links);

      return Response.success(ctx, response);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }

      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "show_note",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to show note",
    );
  }
}

export async function showAllNotes(ctx: Context) {
  HTTPMetrics.track("GET", "/notes/user");
  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_user_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    const validUser = await userService.findById(userId);
    if (!validUser) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_user_notes_forbidden",
      });
      return Response.forbidden(ctx, "User ID does not exist");
    }

    const url = ctx.request.url;
    const tags = url.searchParams.getAll("tags");
    const sortBy = url.searchParams.get("sort_by") || "createdAt";
    const sortOrder = (url.searchParams.get("sort_order") as "asc" | "desc") ||
      "desc";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") || "10", 10);

    try {
      const { notes, totalCount } = await noteService.searchNotes({
        userId,
        query: "",
        tags,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });

      const pageCount = Math.ceil(totalCount / pageSize);
      const baseURL = `${url.protocol}//${url.host}`;
      const links: { [key: string]: NoteLink } = {
        self: { href: `${baseURL}/notes/user`, method: "GET" },
      };

      const response = newNotesPageResponse(
        notes,
        totalCount,
        pageCount,
        page,
        links,
        (note) => ({
          self: makeNoteLink(note.noteId, "self"),
          update: makeNoteLink(note.noteId, "update"),
          delete: makeNoteLink(note.noteId, "delete"),
        }),
      );

      return Response.success(ctx, response);
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "get_user_notes",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to get user notes",
    );
  }
}

export async function pinNote(ctx: RouterContext<"/note/:id/pin">) {
  HTTPMetrics.track("PUT", "/note/:id/pin");
  try {
    const noteId = ctx.params.id;
    const userId = ctx.state.user?.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "pin_note_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      await noteService.togglePin(validUser.userId, noteId);

      return Response.success(ctx, { message: "Pin status toggled" });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "pin_note",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to pin note",
    );
  }
}

export async function updatePinPosition(
  ctx: RouterContext<"/note/:id/pin/position">,
) {
  HTTPMetrics.track("PUT", "/note/:id/pin/position");
  try {
    const noteId = ctx.params.id;
    const userId = ctx.state.user?.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_pin_position_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const { newPos } = await ctx.request.body.json();
      if (typeof newPos !== "number" || isNaN(newPos)) {
        return Response.badRequest(ctx, "Invalid or missing newPos");
      }

      await noteService.updatePinPosition(validUser.userId, noteId, newPos);

      return Response.success(ctx, { message: "Pin position updated" });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "update_pin_position",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to update pin position",
    );
  }
}

export async function showNoteTags(ctx: Context) {
  HTTPMetrics.track("GET", "/notes/tags");
  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_tags_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    try {
      const validUser = await userService.findById(userId);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "get_note_tags_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const tagsWithCount = await noteService.getNoteTags(userId);
      return Response.success(ctx, { tags: tagsWithCount });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "get_note_tags",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to get note tags",
    );
  }
}

export async function showNoteNames(ctx: Context) {
  HTTPMetrics.track("GET", "/notes/names");
  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_names_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    const validUser = await userService.findById(userId);
    if (!validUser) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_names_forbidden",
      });
      return Response.forbidden(ctx, "User ID does not exist");
    }

    try {
      const noteNames = await noteService.getNoteNames(userId);
      return Response.success(ctx, { noteNames });
    } catch (error) {
      if (error instanceof Error) {
        return Response.badRequest(ctx, error.message);
      }
      throw error;
    }
  } catch (error) {
    ErrorCounter.add(1, {
      type: "internal",
      operation: "get_note_names",
    });
    return Response.internalError(
      ctx,
      error instanceof Error ? error.message : "Failed to get note names",
    );
  }
}
