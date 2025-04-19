import { newNotesPageResponse, NoteLink, toNoteResponse } from "../dto/note.ts";
import { Response } from "../utils/response.ts";
import { Note } from "../models/note.ts";
import { HTTPMetrics } from "../utils/metrics.ts";
import { noteService, userService } from "../config/serviceSetup.ts";
import { Context } from "@oak/oak";
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
  } catch (err) {
    return Response.badRequest(
      ctx,
      err instanceof Error ? err.message : "Failed to search notes",
    );
  }
}

export async function newNote(ctx: Context) {
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
      const userId = await ctx.state?.userId;
      if (!userId) {
        return Response.unauthorized(ctx, "User not found");
      }

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
  }
}
