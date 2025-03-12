import { User, UserProfile } from "../models/userModel.ts";
import { UserRepo } from "../repositories/userRepo.ts";
import { validatePassword } from "../utils/password.ts";
import { hashPassword } from "../services/passwordService.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import { MongoClient } from "mongodb";
import "@std/dotenv/load";

export class UserService {
  private userRepo: UserRepo;

  constructor() {
    const dbClient = new MongoClient(Deno.env.get("MONGO_URI") as string);
    this.userRepo = new UserRepo(dbClient);
  }

  async createUser(
    username: string,
    email: string,
    password: string,
  ): Promise<User> {
    const timer = trackDbOperation("create", "user");

    if (!validatePassword(password)) {
      throw new Error(
        "Password must have at least 2 special characters, 2 numbers, and be at least 8 characters long",
      );
    }
    try {
      const hashedPassword = await hashPassword(password);
      const newId = crypto.randomUUID();

      const user: User = {
        userId: newId,
        username,
        passwordHash: hashedPassword,
        createdAt: new Date(),
        email,
        twoFactorEnabled: false,
      };

      const createdUser = await this.userRepo.createUser(user);
      return createdUser;
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "create_user" });
      console.error("Error creating user");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async getUserProfile(username: string): Promise<UserProfile> {
    const timer = trackDbOperation("find", "profile");

    try {
      const exists = await this.userRepo.findByUsername(username);
      if (!exists) {
        throw new Error("User not found");
      }

      const userProfile = {
        username: username,
        email: exists.email,
        createdAt: exists.createdAt,
      };

      return userProfile;
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "get_user_profile" });
      console.error("Error getting user profile");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
