import { Collection, MongoClient } from "mongodb";
import { User } from "../models/user.ts";
import { DatabaseMetrics, ErrorCounter } from "../utils/metrics.ts";
import "@std/dotenv/load";

export class UserRepo {
  private collection: Collection<User>;

  constructor(db: MongoClient) {
    const dbName = Deno.env.get("MONGO_DB") as string;
    const collectionName = Deno.env.get("USER_COLLECTION") as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  async createUser(user: User): Promise<User> {
    const timer = DatabaseMetrics.track("insert", "users");
    try {
      if (!user.username || user.username.trim() === "") {
        throw new Error("Username is required");
      }

      const result = await this.collection.insertOne(user);
      if (!result.acknowledged) {
        throw new Error("Failed to insert user");
      }

      return user;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "create_user_failed",
      });
      console.error("Failed to create user: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    const timer = DatabaseMetrics.track("find", "users");
    try {
      const user = await this.collection.findOne({ username });
      if (!user) {
        return null;
      }
      return user;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "find_by_username_failed",
      });
      console.error("Failed to find user by username: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const timer = DatabaseMetrics.track("find", "users");
    try {
      const user = await this.collection.findOne({ email });
      if (!user) {
        return null;
      }
      return user;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "find_by_email_failed",
      });
      console.error("Failed to find user by email: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async findById(userId: string): Promise<User | null> {
    const timer = DatabaseMetrics.track("find", "users");
    try {
      const user = await this.collection.findOne(
        { userId: userId },
      );
      if (!user) {
        console.log("User cannot be found (incorrect userId)");
        return null;
      }
      return user;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "find_by_id_failed",
      });
      console.error("Failed to find user by id: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async updateUserPassword(
    userId: string,
    passwordHash: string,
  ): Promise<number> {
    const timer = DatabaseMetrics.track("update", "users");
    try {
      if (!passwordHash) {
        ErrorCounter.add(1, {
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
      ErrorCounter.add(1, {
        type: "database",
        operation: "password_update_failed",
      });
      console.error("Failed to update user password: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async updateUsernameById(
    userId: string,
    updateData: User,
  ): Promise<User | null> {
    const timer = DatabaseMetrics.track("update", "users");
    try {
      const result = await this.collection.findOneAndUpdate(
        { userId: userId },
        {
          $set: {
            username: updateData.username,
            lastUsernameChange: new Date(),
          },
        },
        {
          returnDocument: "after",
        },
      );

      return result || null;
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "username_update_failed",
      });
      console.error("Failed to update username: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async deleteUserById(userId: string): Promise<void> {
    const timer = DatabaseMetrics.track("delete", "users");
    if (!userId) {
      ErrorCounter.add(1, {
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
        ErrorCounter.add(1, {
          type: "database",
          operation: "delete_user_failed",
        });
      }
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "delete_user_failed",
      });
      console.error("Failed to delete user: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async updateUserEmail(userId: string, email: string): Promise<number> {
    const timer = DatabaseMetrics.track("update", "users");
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
      ErrorCounter.add(1, {
        type: "database",
        operation: "email_update_failed",
      });
      console.error("Failed to update user email: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async enableTwoFactor(
    userId: string,
    secret: string,
    recoveryCodes: string[],
  ): Promise<void> {
    const timer = DatabaseMetrics.track("update", "users");
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
        ErrorCounter.add(1, {
          type: "database",
          operation: "user_not_found",
        });
        throw new Error("User not found");
      }
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "two_factor_enable_failed",
      });
      console.error("Failed to enable two factor: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }

  async disableTwoFactor(userId: string): Promise<void> {
    const timer = DatabaseMetrics.track("update", "users");
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
        ErrorCounter.add(1, {
          type: "database",
          operation: "user_not_found",
        });
        throw new Error("User not found");
      }
    } catch (error) {
      ErrorCounter.add(1, {
        type: "database",
        operation: "two_factor_disable_failed",
      });
      console.error("Failed to disable two factor: ", error);
      throw error;
    } finally {
      timer.end();
    }
  }
}
