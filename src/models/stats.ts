/**
 * @file Defines the `NoteStats`, `TodoStats`, and `ActivityStats` interfaces,
 * representing application statistics within the tonotes application.
 */

/**
 * Represents statistics related to notes.
 */
export interface NoteStats {
  /**
   * The total number of notes.
   */
  total: number;

  /**
   * The number of archived notes.
   */
  archived: number;

  /**
   * The number of pinned notes.
   */
  pinned: number;

  /**
   * A dictionary containing the counts of each tag used in notes. The keys are the tag
   * names, and the values are the number of times each tag appears.
   */
  tag_counts: { [key: string]: number };
}

/**
 * Represents statistics related to to-do items.
 */
export interface TodoStats {
  /**
   * The total number of to-do items.
   */
  total: number;

  /**
   * The number of archived to-do items.
   */
  archived: number;

  /**
   * The number of completed to-do items.
   */
  completed: number;
}

/**
 * Represents statistics related to user activity.
 */
export interface ActivityStats {
  /**
   * The date and time of the user's last activity.
   */
  lastActive: Date;

  /**
   * The date and time when the user account was created.
   */
  createdAt: Date;

  /**
   * The total number of sessions the user has had.
   */
  totalSessions: number;
}
