import { Collection, MongoClient, ObjectId } from "mongodb/mongodb/mongodb";
import { User, UserProfile } from "../models/user";
import { ErrorCounter, trackDbOperation } from "../utils/metrics";
import dotenv from "dotenv/lib/main/lib/main";
dotenv.config();

export class UserRepository {
  private collection: Collection<User>;

  constructor(db: MongoClient) {
    const dbName = process.env.MONGO_DB as string;
    const collectionName = process.env.USER_COLLECTION as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  async createUser(user: User): Promise<User> {
    const timer = trackDbOperation("insert", "users");
    try {
      if (
        !user.username || user.username.trim() === ""
      ) {
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

  async deleteUserById(userId: string): Promise<number> {
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

      return result.deletedCount;
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
