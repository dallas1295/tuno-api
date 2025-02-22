export enum PriorityLevel {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export enum RecurrencePattern {
  Daily = "daily",
  Weekly = "weekly",
  Monthly = "monthly",
  Yearly = "yearly",
}

export interface Todo {
  todoId: string;
  userId: string;
  todoName: string;
  description: string;
  complete: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  priorityLevel?: PriorityLevel;
  dueDate?: Date;
  reminderAt?: Date;
  isRecurring?: boolean;
  recurrancePattern?: RecurrencePattern;
  recurranceEnd?: Date;
}
