import * as argon2 from "argon2";
import { validatePassword } from "../utils/password";() 

const passwordConfig = {
  memory: 64 * 1024,
  iterations: 3,
  keyLength: 32,
} as const;


export async function hashPassword(password: string): Promise<string> {
  if (!validatePassword(password)) {
    throw new Error("Invalid password: must be at least 8 characters long, atleast 2 numbers, and atleast 2 special characters");
  }

  const salt = 
}
