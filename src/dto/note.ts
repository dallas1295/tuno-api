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

export const noteService = {
  toNoteResponse: async (
    note: Note,
    links: { [key: string]: NoteLink },
  ): Promise<NoteResponse> => {
    return {
      noteId: note.noteId,
      noteName: note.noteName,
      content: note.content,
      tags: note.tags,
      isPinned: note.isPinned,
      pinnedPosition:
        note.pinnedPosition !== 0 ? note.pinnedPosition : undefined,
      isArchived: note.isArchived,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      links: links,
    };
  },

  toManyNoteResponses: async (
    notes: Note[],
    getNoteLinks: (note: Note) => { [key: string]: NoteLink },
  ): Promise<NoteResponse[]> => {
    return Promise.all(
      notes.map((note) => noteService.toNoteResponse(note, getNoteLinks(note))),
    );
  },

  newNotesPageResponse: async (
    notes: Note[],
    totalCount: number,
    pageCount: number,
    currentPage: number,
    links: { [key: string]: NoteLink },
    getNoteLinks: (note: Note) => { [key: string]: NoteLink },
  ): Promise<NotePageResponse> => {
    const noteResponses = await noteService.toManyNoteResponses(
      notes,
      getNoteLinks,
    );
    return {
      notes: noteResponses,
      totalCount: totalCount,
      pageCount: pageCount,
      currentPage: currentPage,
      links: links,
    };
  },
};
