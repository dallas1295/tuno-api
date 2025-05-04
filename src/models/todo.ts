export const Priority = {
  low: "low",
  medium: "medium",
  high: "high",
} as const;

export const Pattern = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
} as const;

export interface Todo {
  todoId: string;
  userId: string;
  todoName: string;
  description: string;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  priority?: keyof typeof Priority;
  dueDate?: Date;
  reminderAt?: Date;
  isRecurring?: boolean;
  recurringPattern?: keyof typeof Pattern;
  recurrenceEnd?: Date;
}
