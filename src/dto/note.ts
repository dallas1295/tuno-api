import { Note } from "../models/note.ts";

export interface NoteLink {
  href: string;
  method?: string;
}

export interface NoteResponse {
  noteId: string;
  noteName: string;
  content: string;
  tags?: string[];
  isPinned: boolean;
  pinnedPosition?: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  links: { [key: string]: NoteLink };
}

export interface NotePageResponse {
  notes: NoteResponse[];
  totalCount: number;
  pageCount: number;
  currentPage: number;
  links: { [keys: string]: NoteLink };
}

export function toNoteResponse(
  note: Note,
  links: { [key: string]: NoteLink },
): NoteResponse {
  return {
    noteId: note.noteId,
    noteName: note.noteName,
    content: note.content,
    tags: note.tags,
    isPinned: note.isPinned,
    pinnedPosition: note.pinnedPosition !== 0 ? note.pinnedPosition : undefined,
    isArchived: note.isArchived,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    links: links,
  };
}

export function toManyNoteResponses(
  notes: Note[],
  getNoteLinks: (note: Note) => { [key: string]: NoteLink },
): NoteResponse[] {
  return notes.map((note) => toNoteResponse(note, getNoteLinks(note)));
}

export function newNotesPageResponse(
  notes: Note[],
  totalCount: number,
  pageCount: number,
  currentPage: number,
  links: { [key: string]: NoteLink },
  getNoteLinks: (note: Note) => { [key: string]: NoteLink },
): NotePageResponse {
  const noteResponses = toManyNoteResponses(notes, getNoteLinks);
  return {
    notes: noteResponses,
    totalCount: totalCount,
    pageCount: pageCount,
    currentPage: currentPage,
    links: links,
  };
}
