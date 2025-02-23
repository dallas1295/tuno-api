/**
 * @file Defines the `Todo`, `PriorityLevel`, and `RecurrencePattern` enums/interfaces
 * representing a to-do item within the tonotes application.
 */

/**
 * Represents the possible priority levels for a to-do item.
 */
export enum PriorityLevel {
  /**H
   * Low priority.
   */
  Low = "low",

  /**
   * Medium priority.
   */
  Medium = "medium",

  /**
   * High priority.
   */
  High = "high",
}

/**
 * Represents the possible recurrence patterns for a recurring to-do item.
 */
export enum RecurrencePattern {
  /**
   * Occurs daily.
   */
  Daily = "daily",

  /**
   * Occurs weekly.
   */
  Weekly = "weekly",

  /**
   * Occurs monthly.
   */
  Monthly = "monthly",

  /**
   * Occurs yearly.
   */
  Yearly = "yearly",
}

/**
 * Represents a to-do item with its properties.
 */
export interface Todo {
  /**
   * A unique identifier for the to-do item. This should be a UUID.
   */
  todoId: string;

  /**
   * The ID of the user who owns this to-do item.
   */
  userId: string;

  /**
   * The name or title of the to-do item.
   */
  todoName: string;

  /**
   * A more detailed description of the to-do item.
   */
  description: string;

  /**
   * A boolean value indicating whether the to-do item has been completed.
   */
  complete: boolean;

  /**
   * The date and time when the to-do item was created.
   */
  createdAt: string; // Consider using Date if dealing with actual Date objects

  /**
   * The date and time when the to-do item was last updated.
   */
  updatedAt: Date;
  /**
   * An optional array of tags associated with the to-do item.
   */
  tags?: string[];

  /**
   * The priority level of the to-do item.
   */
  priorityLevel?: PriorityLevel;

  /**
   * The date when the to-do item is due.
   */
  dueDate?: Date;

  /**
   * The date and time when a reminder should be sent for the to-do item.
   */
  reminderAt?: Date;

  /**
   * A boolean value indicating whether the to-do item is recurring.
   */
  isRecurring?: boolean;

  /**
   * The recurrence pattern for the to-do item.
   */
  recurrancePattern?: RecurrencePattern;

  /**
   * The date when the recurrence should end.
   */
  recurranceEnd?: Date;
}
