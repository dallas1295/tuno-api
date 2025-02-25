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
