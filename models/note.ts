/* tonotes-server-ts/models/note.ts */

/**
 * @file Defines the `Note` interface, representing a note within the tonotes application.
 */

/**
 * Represents a note object with its properties.
 */
export interface Note {
  /**
   * A unique identifier for the note.  This is a required field and should be a
   * universally unique identifier (UUID) string.
   */
  note_id: string; // not optional

  /**
   * The ID of the user who owns this note.  This field establishes the relationship
   * between the note and the user in the system.
   */
  user_id: string;

  /**
   * The title of the note.  This provides a brief summary or heading for the note's content.
   */
  title: string;

  /**
   * The main content of the note.  This can be any string value and is where the
   * primary information of the note is stored.
   */
  content: string; // not optional

  /**
   * The date and time when the note was initially created.  This field is automatically
   * generated when a new note is created.
   */
  created_at: Date;

  /**
   * The date and time when the note was last updated.  This field is updated whenever
   * the note's content or any of its other properties are modified.
   */
  updated_at: Date;

  /**
   * An optional array of tags associated with the note.  Tags can be used to categorize
   * and organize notes, making them easier to search and filter.
   */
  tags?: string[];

  /**
   * A boolean value indicating whether the note is pinned.  Pinned notes are typically
   * displayed prominently in the user interface.
   */
  is_pinned: boolean;

  /**
   * A boolean value indicating whether the note is archived.  Archived notes are typically
   * hidden from the main view but can still be accessed.
   */
  is_archived: boolean;

  /**
   * An optional number representing the position of the note when pinned.  This can be
   * used to order pinned notes in a specific way.
   */
  pinned_position?: number;

  /**
   * An optional number representing the search score of the note.  This can be used to
   * rank search results based on relevance.  Higher scores indicate greater relevance.
   */
  search_score?: number;
}
