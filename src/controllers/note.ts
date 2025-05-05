import {
  CreateNoteReq,
  newNotesPageResponse,
  NoteLink,
  toNoteResponse,
} from "../dto/note.ts";
import { Response } from "../utils/response.ts";
import { ErrorCounter, HTTPMetrics } from "../utils/metrics.ts";
import { noteService, userService } from "../config/serviceSetup.ts";
import { Context, RouterContext } from "@oak/oak";
import { makeNoteLink } from "../utils/makeLinks.ts";

export async function searchNotes(ctx: Context) {
  HTTPMetrics.track("GET", "/notes/search");

  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
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

export async function newNote(ctx: RouterContext<"/api/:userId/notes/create">) {
  HTTPMetrics.track("PUT", "/notes/create");

  try {
    const userIdToken = ctx.state.user?.userId;
    if (!userIdToken) {
      return Response.unauthorized(ctx, "User not found");
    }
    const userIdParams = ctx.params.userId;
    if (userIdToken !== userIdParams) {
      return Response.forbidden(
        ctx,
        "Token userId and Context userId do not match",
      );
    }

    const body: CreateNoteReq = await ctx.request.body.json();
    if (!body) {
      return Response.badRequest(ctx, "Note not provided");
    }

    try {
      const validUser = await userService.findById(userIdToken);
      if (!validUser) {
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const { noteName, content, tags, isPinned } = body;
      const createdNote = await noteService.createNote(
        userIdToken,
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

export async function updateNote(
  ctx: RouterContext<"/api/:userId/note/:id/update">,
) {
  HTTPMetrics.track("PUT", "/api/:userId/note/:id/update");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const noteId = ctx.params.id;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only update your own notes");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_notes_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const validNote = await noteService.getNote(validUser.userId, noteId);
      if (!validNote) {
        return Response.badRequest(ctx, "Note Id is not valid");
      }

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

export async function deleteNote(
  ctx: RouterContext<"/api/:userId/note/:id/delete">,
) {
  HTTPMetrics.track("DELETE", "/api/:userId/note/:id/delete");

  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    const noteId = ctx.params.id;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only delete your own notes");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "search_notes_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const validNote = await noteService.getNote(validUser.userId, noteId);
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

export async function showSingleNote(
  ctx: RouterContext<"/api/:userId/note/:id">,
) {
  HTTPMetrics.track("GET", "/api/:userId/note/:id");

  const userIdFromToken = ctx.state.user?.userId;
  const userIdFromParams = ctx.params.userId;
  const noteId = ctx.params.id;

  if (!userIdFromToken) {
    ErrorCounter.add(1, {
      type: "auth",
      operation: "search_notes_unauthorized",
    });
    return Response.unauthorized(ctx, "Missing or invalid token");
  }

  if (userIdFromToken !== userIdFromParams) {
    return Response.forbidden(ctx, "You can only view your own notes");
  }

  try {
    if (!noteId) {
      return Response.badRequest(ctx, "Note id not provided");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
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

export async function showAllNotes(ctx: RouterContext<"/api/:userId/notes">) {
  HTTPMetrics.track("GET", "/api/:userId/notes");
  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;

    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_user_notes_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }

    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only view your own notes");
    }

    const validUser = await userService.findById(userIdFromToken);
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
        userId: userIdFromToken,
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
        self: {
          href: `${baseURL}/api/${userIdFromToken}/notes`,
          method: "GET",
        },
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

export async function pinNote(ctx: RouterContext<"/api/:userId/note/:id/pin">) {
  HTTPMetrics.track("PUT", "/api/:userId/note/:id/pin");
  try {
    const noteId = ctx.params.id;
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "pin_note_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }
    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only pin your own notes");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
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
  ctx: RouterContext<"/api/:userId/note/:id/pin/position">,
) {
  HTTPMetrics.track("PUT", "/api/:userId/note/:id/pin/position");
  try {
    const noteId = ctx.params.id;
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;

    if (!noteId) {
      return Response.badRequest(ctx, "Note ID not found");
    }
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "update_pin_position_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }
    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(
        ctx,
        "You can only update pin positions for your own notes",
      );
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
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

export async function showNoteTags(
  ctx: RouterContext<"/api/:userId/notes/tags">,
) {
  HTTPMetrics.track("GET", "/api/:userId/notes/tags");
  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_tags_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }
    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only view your own note tags");
    }

    try {
      const validUser = await userService.findById(userIdFromToken);
      if (!validUser) {
        ErrorCounter.add(1, {
          type: "auth",
          operation: "get_note_tags_forbidden",
        });
        return Response.forbidden(ctx, "User ID does not exist");
      }

      const tagsWithCount = await noteService.getNoteTags(userIdFromToken);
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

export async function showNoteNames(
  ctx: RouterContext<"/api/:userId/notes/names">,
) {
  HTTPMetrics.track("GET", "/api/:userId/notes/names");
  try {
    const userIdFromToken = ctx.state.user?.userId;
    const userIdFromParams = ctx.params.userId;
    if (!userIdFromToken) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_names_unauthorized",
      });
      return Response.unauthorized(ctx, "User not found");
    }
    if (userIdFromToken !== userIdFromParams) {
      return Response.forbidden(ctx, "You can only view your own note names");
    }

    const validUser = await userService.findById(userIdFromToken);
    if (!validUser) {
      ErrorCounter.add(1, {
        type: "auth",
        operation: "get_note_names_forbidden",
      });
      return Response.forbidden(ctx, "User ID does not exist");
    }

    try {
      const noteNames = await noteService.getNoteNames(userIdFromToken);
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
