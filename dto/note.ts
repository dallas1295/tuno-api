import { Note } from "../models/note";

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

export async function toSingleNoteResponse(
  note: Note,
  links: { [key: string]: NoteLink },
): Promise<NoteResponse> {
  const response: NoteResponse = {
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

  return response;
}

export async function toManyNoteResponses(
  notes: Note[],
  getNoteLinks: (note: Note) => { [key: string]: NoteLink },
): Promise<NoteResponse[]> {
  const responses: NoteResponse[] = await Promise.all(
    notes.map((note) => toSingleNoteResponse(note, getNoteLinks(note))),
  );

  return responses;
}

export async function newNotesPageResponse(
  notes: Note[],
  totalCount: number,
  pageCount: number,
  currentPage: number,
  links: { [key: string]: NoteLink },
  getNoteLinks: (note: Note) => { [key: string]: NoteLink },
): Promise<NotePageResponse> {
  const noteResponses = await toManyNoteResponses(notes, getNoteLinks);

  return {
    notes: noteResponses,
    totalCount: totalCount,
    pageCount: pageCount,
    currentPage: currentPage,
    links: links,
  };
}
