export enum Priority {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export enum Pattern {
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
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  priorityLevel?: Priority;
  dueDate?: Date;
  reminderAt?: Date;
  isRecurring?: boolean;
  pattern?: Pattern;
  recurrenceEnd?: Date;
}
