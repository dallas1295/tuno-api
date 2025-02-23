/**
 * @file Defines the `UserRepository` class, responsible for interacting with the
 * user collection in the MongoDB database. This class provides methods for creating,
 * retrieving, updating, and deleting user accounts.
 */

import { Collection, MongoClient, ObjectId } from "mongodb";
import { User, UserProfile } from "../models/user";
import { ErrorCounter, trackDbOperation } from "../utils/metrics";
import dotenv from "dotenv";
dotenv.config();

/**
 * Provides methods for managing user data in the MongoDB database.
 */
export class UserRepository {
  /**
   * The MongoDB collection for storing user documents.
   * @private
   */
  private collection: Collection<User>;

  /**
   * Constructs a new UserRepository instance.
   *
   * @param db A MongoClient instance connected to the MongoDB database.
   */
  constructor(db: MongoClient) {
    const dbName = process.env.MONGO_DB as string;
    const collectionName = process.env.USER_COLLECTION as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  /**
   * Creates a new user account in the database.
   *
   * @param user The user object to create.  The `userId` property will be automatically
   *        generated and added to the user object after insertion.  The `username`
   *        property is required.
   * @returns A Promise that resolves to the created user object, including the
   *          automatically generated `userId`.
   * @throws If the username is missing or empty, or if there's a database error.
   */
  async createUser(user: User): Promise<User> {
    const timer = trackDbOperation("insert", "users");
    try {
      if (!user.username || user.username.trim() === "") {
        throw new Error("Username is required");
      }

      const result = await this.collection.insertOne(user);

      return {
        ...user,
        userId: result.insertedId.toString(),
      };
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

  /**
   * Finds a user by their username.
   *
   * @param username The username to search for.
   * @returns A Promise that resolves to the user object if found, or `null` if not found.
   * @throws If there's a database error.
   */
  async findByUsername(username: string): Promise<User | null> {
    const timer = trackDbOperation("find", "users");

    try {
      const user = await this.collection.findOne({ username });

      if (!user) {
        return null;
      }

      return user;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "find_by_username_failed",
      });
      console.error("Failed to find user by username: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Finds a user by their user ID.
   *
   * @param userId The ID of the user to search for.
   * @returns A Promise that resolves to the user object if found, or `null` if not found.
   * @throws If there's a database error.
   */
  async findById(userId: string): Promise<User | null> {
    const timer = trackDbOperation("find", "users");
    try {
      console.log(`Finding user with id: ${userId}`);

      const user = await this.collection.findOne(
        { userId: userId },
        {
          projection: {
            userId: 1,
            username: 1,
            passwordHash: 1,
            createdAt: 1,
            lastEmailChange: 1,
            lastPasswordChange: 1,
            isActive: 1,
            twoFactorSecret: 1,
            twoFactorEnabled: 1,
            recoveryCodes: 1,
          },
        },
      );

      if (!user) {
        console.log("User cannot be found (incorrect userId)");
        return null;
      }

      return user;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "find_by_id_failed",
      });
      console.error("Failed to find user by id: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Updates a user's password.
   *
   * @param userId The ID of the user to update.
   * @param passwordHash The new, hashed password.
   * @returns A Promise that resolves to the number of documents modified (0 or 1).
   * @throws If the passwordHash is missing or if there's a database error.
   */
  async updateUserPassword(
    userId: string,
    passwordHash: string,
  ): Promise<number> {
    const timer = trackDbOperation("update", "users");

    try {
      if (!passwordHash) {
        ErrorCounter.inc({
          type: "database",
          operation: "invalid_password_hash",
        });
        throw new Error("Password hashing error");
      }

      const result = await this.collection.updateOne(
        { userId },
        {
          $set: {
            passwordHash: passwordHash,
            lastPasswordChange: new Date(),
          },
        },
      );

      return result.modifiedCount;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "password_update_failed",
      });
      console.error("Failed to update user password: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Updates a user's username by their user ID.
   *
   * @param userId The ID of the user to update.
   * @param updateData The user object containing the new username.
   * @returns A Promise that resolves to the number of documents modified (0 or 1).
   * @throws If there's a database error.
   */
  async updateUsernameById(userId: string, updateData: User): Promise<number> {
    const timer = trackDbOperation("update", "users");

    try {
      const result = await this.collection.updateOne(
        { userId: userId },
        {
          $set: {
            username: updateData.username,
          },
        },
      );

      return result.modifiedCount;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "username_update_failed",
      });
      console.error("Failed to update username: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Deletes a user account by their user ID.
   *
   * @param userId The ID of the user to delete.
   * @returns A Promise that resolves to the number of documents deleted (0 or 1).
   * @throws If the user ID is missing, or if there's a database error.
   */
  async deleteUserById(userId: string): Promise<void> {
    const timer = trackDbOperation("delete", "users");
    if (!userId) {
      ErrorCounter.inc({
        type: "database",
        operation: "invalid_user_id",
      });
      throw new Error(
        "This user has already been deleted, or user id is invalid",
      );
    }
    try {
      const result = await this.collection.deleteOne({ userId });

      if (result.deletedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "delete_user_failed",
        });
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "delete_user_failed",
      });
      console.error("Failed to delete user: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Updates a user's email address.
   *
   * @param userId The ID of the user to update.
   * @param email The new email address.
   * @returns A Promise that resolves to the number of documents modified (0 or 1).
   * @throws If there's a database error.
   */
  async updateUserEmail(userId: string, email: string): Promise<number> {
    const timer = trackDbOperation("update", "users");
    try {
      const result = await this.collection.updateOne(
        { userId: userId },
        {
          $set: {
            email: email,
            lastEmailChange: new Date(),
          },
        },
      );
      return result.modifiedCount;
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "email_update_failed",
      });
      console.error("Failed to update user email: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Enables two-factor authentication for a user.
   *
   * @param userId The ID of the user to update.
   * @param secret The two-factor authentication secret.
   * @param recoveryCodes An array of recovery codes.
   * @throws If the user is not found or if there's a database error.
   */
  async enableTwoFactor(
    userId: string,
    secret: string,
    recoveryCodes: string[],
  ): Promise<void> {
    const timer = trackDbOperation("update", "users");

    try {
      const result = await this.collection.updateOne(
        { userId: userId },
        {
          $set: {
            twoFactorSecret: secret,
            twoFactorEnabled: true,
            recoveryCodes: recoveryCodes,
          },
        },
      );

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "user_not_found",
        });
        throw new Error("User not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "two_factor_enable_failed",
      });
      console.error("Failed to enable two factor: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }

  /**
   * Disables two-factor authentication for a user.
   *
   * @param userId The ID of the user to update.
   * @throws If the user is not found or if there's a database error.
   */
  async disableTwoFactor(userId: string): Promise<void> {
    const timer = trackDbOperation("update", "users");

    try {
      const result = await this.collection.updateOne(
        { userId: userId },
        {
          $set: {
            twoFactorEnabled: false,
          },
          $unset: {
            twoFactorSecret: "",
            recoveryCodes: "",
          },
        },
      );

      if (result.matchedCount === 0) {
        ErrorCounter.inc({
          type: "database",
          operation: "user_not_found",
        });
        throw new Error("User not found");
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "two_factor_disable_failed",
      });
      console.error("Failed to disable two factor: ", error);
      throw error;
    } finally {
      timer.observeDuration();
    }
  }
}
