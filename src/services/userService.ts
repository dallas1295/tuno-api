import { User, UserProfile } from "../models/userModel.ts";
import { UserRepo } from "../repositories/userRepo.ts";
import { validateEmail, validatePassword } from "../utils/validation.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import { generateRecoveryCodes } from "../utils/recovery.ts";
import { verifyTOTP } from "../utils/totp.ts";
import { hashPassword, verifyPassword } from "../services/passwordService.ts";
import { MongoClient } from "mongodb";
import * as OTPAuth from "@hectorm/otpauth";
import * as denoqr from "@openjs/denoqr";
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
        const timeSinceChange = Date.now() -
          exists.lastPasswordChange.getTime();
        const timeRemaining = Math.max(0, twoWeeks - timeSinceChange);

        if (timeRemaining > 0) {
          throw new Error(
            `Password can only be changed every 2 weeks. Time remaining: ${
              Math.ceil(timeRemaining / (24 * 60 * 60 * 1000))
            } days`,
          );
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
  async updateUsername(
    userId: string,
    oldName: string,
    newName: string,
  ): Promise<User | null> {
    const timer = trackDbOperation("update", "username");

    try {
      const exists = await this.userRepo.findById(userId);
      if (!exists) {
        throw new Error("User not found");
      }
      if (!newName || newName.trim() === "") {
        throw new Error("Must provide new username");
      } else if (newName.trim() === oldName.trim()) {
        throw new Error("You are already using this username");
      }

      if (exists.lastUsernameChange) {
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        const timeSinceChange = Date.now() -
          exists.lastUsernameChange.getTime();
        const timeRemaining = Math.max(0, twoWeeks - timeSinceChange);

        if (timeRemaining > 0) {
          throw new Error(
            `Username can only be changed every 2 weeks. Time remaining: ${
              Math.ceil(timeRemaining / (24 * 60 * 60 * 1000))
            } days`,
          );
        }
      }

      const nameUsed = await this.userRepo.findByUsername(newName);

      if (nameUsed) {
        throw new Error("This username is already in use");
      }

      return await this.userRepo.updateUsernameById(
        userId,
        { username: newName.trim() } as User,
      );
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "change_username" });
      console.error("Error updating username");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  async updateEmail(userId: string, newEmail: string): Promise<boolean> {
    const timer = trackDbOperation("update", "email");

    try {
      const exists = await this.userRepo.findById(userId);
      if (!exists) {
        throw new Error("User not found");
      }

      if (exists.email.trim() === newEmail.trim()) {
        throw new Error("You are already using this email");
      }

      if (exists.lastEmailChange) {
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        const timeSinceChange = Date.now() -
          exists.lastEmailChange.getTime();
        const timeRemaining = Math.max(0, twoWeeks - timeSinceChange);

        if (timeRemaining > 0) {
          throw new Error(
            `Email can only be changed every 2 weeks. Time remaining: ${
              Math.ceil(timeRemaining / (24 * 60 * 60 * 1000))
            } days`,
          );
        }
      }

      if (!validateEmail(newEmail)) {
        throw new Error("Must be a valid email addresss");
      }

      const result = await this.userRepo.updateUserEmail(userId, newEmail);

      if (!result) {
        return false;
      }

      return true;
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "change_email" });
      console.error("Error updating email");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async enableTwoFactor(
    userId: string,
  ): Promise<{ enabled: boolean; qrCode: string; uri: string }> {
    const timer = trackDbOperation("enable", "two_factor");

    try {
      const exists = await this.userRepo.findById(userId);

      if (!exists) {
        throw new Error("User not found");
      } else if (exists.twoFactorEnabled) {
        throw new Error("Two factor is already enabled");
      }

      const secret = new OTPAuth.Secret({ size: 32 });
      const totp = new OTPAuth.TOTP({
        issuer: "toNotes",
        label: "toNotesAuth",
        algorith: "SHA512",
        digits: 6,
        period: 30,
        secret: secret,
      });

      const recovery = generateRecoveryCodes();
      const uri = OTPAuth.URI.stringify(totp);
      const qrSvg = denoqr.renderToSvg(denoqr.encodeText(uri));

      await this.userRepo.enableTwoFactor(userId, secret, recovery);

      return { enabled: true, qrCode: qrSvg, uri: uri };
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "enable_two_factor" });
      console.error("Error enabling two factor");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async disableTwoFactor(
    userId: string,
    totp: string,
    password: string,
  ): Promise<boolean> {
    const timer = trackDbOperation("disable", "two_factor");

    try {
      const exists = await this.userRepo.findById(userId);
      if (!exists) {
        throw new Error("User not found");
      }

      if (exists.twoFactorEnabled === false) {
        throw new Error("Two factor cannot be disable (not enabled)");
      }

      const verifiedPassword = await verifyPassword(
        exists.passwordHash,
        password,
      );
      if (!verifiedPassword) {
        throw new Error("Invalid password");
      }

      const verifiedTotp = verifyTOTP(exists.twoFactorSecret, totp);
      if (!verifiedTotp) {
        throw new Error("OTP cannot be verified");
      }

      await this.userRepo.disableTwoFactor(userId);

      return true;
    } catch (error) {
      ErrorCounter.inc({
        type: "UserService",
        operation: "disable_two_factor",
      });
      console.error("Error disabling two factor");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
  async deleteUser(
    userId: string,
    passwordOnce: string,
    passwordTwice: string,
    totp?: string,
  ): Promise<void> {
    const timer = trackDbOperation("delete", "user");

    try {
      const exists = await this.userRepo.findById(userId);
      if (!exists) {
        throw new Error("User not found");
      }

      const verifiedPasswordOnce = await verifyPassword(
        exists.passwordHash,
        passwordOnce,
      );

      if (!verifiedPasswordOnce) {
        throw new Error("Invalid password");
      }
      const verifiedPasswordTwice = await verifyPassword(
        exists.passwordHash,
        passwordTwice,
      );

      if (!verifiedPasswordTwice) {
        throw new Error("Invalid password");
      }
      if (exists.twoFactorEnabled) {
        if (!totp) {
          throw new Error("OTP is required when two-factor is enabled");
        }
        const verifiedTotp = verifyTOTP(exists.twoFactorSecret, totp);
        if (!verifiedTotp) {
          throw new Error("OTP cannot be verified");
        }
      }

      return await this.userRepo.deleteUserById(userId);
    } catch (error) {
      ErrorCounter.inc({ type: "UserService", operation: "delete_user" });
      console.error("Error deleting user");
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
