import { Pattern, Priority } from "../models/todo.ts";

export function validatePassword(password: string): Promise<boolean> {
  // Password must:
  // - Be at least 8 characters long
  // - Contain at least 2 numbers
  // - Contain at least 2 special character

  if (password.length < 8) {
    return Promise.resolve(false);
  }

  const numberCount = (password.match(/\d/g) || []).length;
  const specialCharCount = (password.match(/[^A-Za-z0-9]/g) || []).length;

  const hasNumber = numberCount >= 2;
  const hasSpecial = specialCharCount >= 2;

  return Promise.resolve(hasNumber && hasSpecial);
}

export function validateEmail(email: string): boolean {
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email);
}

export function validateTags(tags?: string[]): string[] | undefined {
  if (!tags || tags.length === 0 || tags.length === 0) {
    return undefined;
  }

  const validTags = tags.map((tag) => tag.trim()).filter((tag) => tag !== "");

  if (validTags.length > 5) {
    throw new Error("cannot exceed 5 tags per todo");
  }

  for (const tag of validTags) {
    if (tag.length > 20) {
      throw new Error("tag cannot exceed 20 characters");
    }
  }

  return validTags;
}

export function validatePriority(
  priority?: keyof typeof Priority,
): keyof typeof Priority | undefined {
  if (!priority) return undefined;

  if (Object.values(Priority).includes(priority)) {
    return priority;
  }

  return undefined;
}

export function validateRecurringPattern(
  pattern?: keyof typeof Pattern,
): keyof typeof Pattern | undefined {
  if (!pattern) return undefined;

  if (Object.values(Pattern).includes(pattern)) {
    return pattern;
  }

  return undefined;
}
