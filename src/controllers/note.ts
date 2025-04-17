import { NoteService } from "../services/note.ts";
import {
  newNotesPageResponse,
  NoteLink,
  NotePageResponse,
  NoteResponse,
} from "../dto/note.ts";
import { Context } from "@oak/oak";
import { Response } from "../utils/response.ts";
import { Note } from "../models/note.ts";

export async function searchNotes(ctx: Context) {
  try {
    const userId = ctx.state.user?.userId;
    if (!userId) {
      return Response.unauthorized(ctx, "User not found");
    }

    const url = ctx.request.url;
    const query = url.searchParams.get("q") || "";
    const tags = url.searchParams.getAll("tags");
    const sortBy = url.searchParams.get("sort_by") || "createdAt";
    const sortOrder = (url.searchParams.get("sort_order") as "asc" | "desc") ||
      "desc";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("page_size") || "10", 10);

    const noteService = await NoteService.initialize();
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

    const getNoteLinks = (note: Note) => ({
      self: { href: `${baseURL}/note/${note.noteId}`, method: "GET" },
      update: { href: `${baseURL}/note/${note.noteId}`, method: "PUT" },
      delete: { href: `${baseURL}/note/${note.noteId}`, method: "DELETE" },
    });

    const response = newNotesPageResponse(
      notes,
      totalCount,
      pageCount,
      page,
      links,
      getNoteLinks,
    );

    return Response.success(ctx, response);
  } catch (err) {
    return Response.badRequest(
      ctx,
      err instanceof Error ? err.message : "Failed to search notes",
    );
  }
}
