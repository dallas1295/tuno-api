import { User, UserProfile } from "../models/userModel.ts";
import { UserRepo } from "../repositories/userRepo.ts";
import { validatePassword } from "../utils/password.ts";
import { hashPassword, verifyPassword } from "../services/passwordService.ts";
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
      const userNameExists = await this.userRepo.findByUsername(username);
      if (userNameExists) {
        throw new Error("Username already exists");
      }

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

  async getProfile(username: string): Promise<UserProfile> {
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
  async changePassword(
    userId: string,
    newPassword: string,
    oldPassword: string,
  ): Promise<void> {
    const timer = trackDbOperation("update", "password");

    try {
      const exists = await this.userRepo.findById(userId);

      if (!exists) {
        throw new Error("User not found");
      }

      if (!await verifyPassword(exists.passwordHash, oldPassword)) {
        throw new Error("Old password is incorrect");
      } else if (!validatePassword(newPassword)) {
        throw new Error(
          "New password must have at least 2 special characters, 2 numbers, and be at least 8 characters long",
        );
      }

      if (exists.lastPasswordChange) {
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        if (Date.now() - exists.lastPasswordChange.getTime() < twoWeeks) {
          throw new Error("Password can only be changed every 2 weeks");
        }
      }

      const hashedPassword = await hashPassword(newPassword);

      await this.userRepo.updateUserPassword(
        userId,
        hashedPassword,
      );
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "change_password" });
      console.error("Error changing password");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
