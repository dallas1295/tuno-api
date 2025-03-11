import { User } from "../models/userModel.ts";
import uuid from "@std/uuid";
import { UserRepo } from "../repositories/userRepo.ts";
import { hashPassword } from "../utils/auth.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import { MongoClient, UpdateFilter } from "mongodb";
import "@std/dotenv/load";

export class UserService {
  private userRepo: UserRepo;

  constructor() {
    const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
    this.userRepo = new UserRepo(dbClient);

    async createUser(username: string, email: string, password: string): Promise<User> {}
    const timer = trackDbOperation("create","user");

    try {
      const existingUser = await this.userRepo.findByUsername(username);
      if (existingUser) {
        throw new Error("Username already exists");
      }

      const 
      if (existingUser) {
        throw new Error("Username already exists");
      }
      const user: User = {
        userId: uuid.generate(),
        username,
        email,
        password,
      };
      const createdUser = await this.userRepo.createUser(user);
      return createdUser;
    } catch (error) {
      ErrorCounter.inc({
      type: "database",
      operation: "create_user_failed",
      });
      console.error("Failed to create user: ", error);
      throw error;
    } finally {
    timer.observeDuration();
    }
}
