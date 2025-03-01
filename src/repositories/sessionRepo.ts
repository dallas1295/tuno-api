import { Collection, MongoClient, UpdateResult } from "npm:mongodb";
import { Session } from "../models/session.ts";
import { createContext } from "../utils/context.ts";
import { GlobalSessionCache } from "../utils/cache.ts";
import { ErrorCounter, trackDbOperation } from "../utils/metrics.ts";
import "jsr:@std/dotenv/load";

export class TodoRepo {
  private collection: Collection<Session>;

  constructor(db: MongoClient) {
    const dbName = Deno.env.get("MONGO_DB") as string;
    const collectionName = Deno.env.get("SESSION_COLLECTION") as string;
    this.collection = db.db(dbName).collection(collectionName);
  }

  async createSession(session: Session): Promise<void> {
    const timer = trackDbOperation("insert", "sessions");
    const { ctx, cancel } = createContext(10000);

    try {
      if (!session) {
        ErrorCounter.inc({
          type: "database",
          operation: "nil_session",
        });
        throw new Error("Session cannot be nil");
      }

      if (!session.sessionId || !session.userId) {
        ErrorCounter.inc({
          type: "database",
          operation: "invalid session_data",
        });
        throw new Error("invalid session data: missing required fields");
      }

      const insertPromise = this.collection.insertOne(session);
      ctx.signal.addEventListener("about", () => {
        insertPromise.catch(() => {});
        throw new Error("Session creation timeout");
      });

      const result = await insertPromise;
      if (!result) {
        ErrorCounter.inc({
          type: "database",
          operation: "session_creation_no_result",
        });
        throw new Error("failed to create session: no result");
      }

      if (GlobalSessionCache) {
        await GlobalSessionCache.setSession(session);
        await GlobalSessionCache.incrementSessionVersion(session.userId);
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "session_creation_failed",
      });
      throw new Error("failed to create session in database: " + error.message);
    } finally {
      cancel();
      timer.observeDuration();
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const timer = trackDbOperation("find", "sessions");
    const { ctx, cancel } = createContext(10000);

    try {
      if (!sessionId) {
        ErrorCounter.inc({ type: "database", operation: "empty_session_id" });
        throw new Error("sessionId cannot be empty");
      }

      if (GlobalSessionCache) {
        const cachedSession = await GlobalSessionCache.getSession(sessionId);
        if (cachedSession) {
          return cachedSession;
        }
      }

      const session = await this.collection.findOne(
        { sessionId },
        { signal: ctx.signal },
      );
      if (!session) {
        ErrorCounter.inc({ type: "database", operation: "session_not_found" });
        return null;
      }

      if (GlobalSessionCache) {
        await GlobalSessionCache.setSession(session);
      }

      return session;
    } catch (error) {
      ErrorCounter.inc({ type: "database", operation: "session_fetch_failed" });
      throw new Error(
        `failed to fetch session from database: ${error.message}`,
      );
    } finally {
      cancel();
      timer.observeDuration();
    }
  }

  async updateSession(session: Session): Promise<void> {
    const timer = trackDbOperation("update", "sessions");
    const { ctx, cancel } = createContext(10000); // 10 seconds timeout

    try {
      if (!session) {
        ErrorCounter.inc({ type: "database", operation: "nil_session" });
        throw new Error("session cannot be nil");
      }

      const update = {
        $set: {
          lastActivityAt: new Date(),
          isActive: session.isActive,
          expiresAt: session.expiresAt,
          deviceInfo: session.deviceInfo,
          ipAddress: session.ipAddress,
        },
      };

      const updatePromise = this.collection.updateOne(
        { sessionId: session.sessionId },
        update,
      );

      // Listen for the abort signal
      ctx.signal.addEventListener("abort", () => {
        updatePromise.catch(() => {}); // Prevent unhandled promise rejection
        throw new Error("Operation aborted due to timeout");
      });

      const result: UpdateResult = await updatePromise;
      if (result.matchedCount === 0) {
        ErrorCounter.inc({ type: "database", operation: "session_not_found" });
        throw new Error("session not found");
      }

      if (GlobalSessionCache) {
        await GlobalSessionCache.setSession(session);
        await GlobalSessionCache.incrementSessionVersion(session.userId);
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "session_update_failed",
      });
      throw new Error(`failed to update session in database: ${error.message}`);
    } finally {
      cancel();
      timer.observeDuration();
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const timer = trackDbOperation("delete", "sessions");

    try {
      await this.collection.deleteOne({ sessionId });
    } catch (error) {
      ErrorCounter.inc({ type: "database", operation: "delete_session" });
      throw new Error("Failed to delete session");
    } finally {
      timer.observeDuration();
    }
  }

  async deleteUserSessions(userId: string): Promise<void> {
    const timer = trackDbOperation("deleteMany", "sessions");

    try {
      await this.collection.deleteMany({ userId });
    } catch (error) {
      ErrorCounter.inc({ type: "database", operation: "delete_user_sessions" });
      throw new Error(`Failed to delete user sessions: ${error.message}`);
    } finally {
      timer.observeDuration();
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const timer = trackDbOperation("update", "sessions");

    try {
      const updateResult = await this.collection.updateOne(
        { sessionId },
        { $set: { isActive: false } },
      );

      if (updateResult.matchedCount === 0) {
        ErrorCounter.inc({ type: "database", operation: "session_not_found" });
        throw new Error("Session not found");
      }
    } catch (error) {
      ErrorCounter.inc({ type: "database", operation: "end_session" });
      throw new Error(`failed to end session: ${error.Message}`);
    } finally {
      timer.observeDuration();
    }
  }

  async getUserActiveSessions(userId: string): Promise<Session[]> {
    const timer = trackDbOperation("find", "sessions");

    try {
      return await this.collection.find({ userId, isActive: true }).toArray();
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "get_user_active_sessions",
      });
      throw new Error(`Failed to get user active sessions: ${error.message}`);
    } finally {
      timer.observeDuration();
    }
  }

  async endAllUserSessions(userId: string): Promise<void> {
    const timer = trackDbOperation("updateMany", "sessions");

    try {
      await this.collection.updateMany(
        { userId, isActive: true },
        { $set: { isActive: false } },
      );
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "end_all_user_sessions",
      });
      throw new Error(`Failed to end all user sessions: ${error.message}`);
    } finally {
      timer.observeDuration();
    }
  }

  async endLeastActiveSession(userId: string): Promise<void> {
    const timer = trackDbOperation("updateOne", "sessions");

    try {
      const session = await this.collection.findOne(
        { userId, isActive: true },
        { sort: { lastActivityAt: 1 } },
      );
      if (session) {
        await this.collection.updateOne(
          { sessionId: session.sessionId },
          { $set: { isActive: false } },
        );
      }
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "end_least_active_session",
      });
      throw new Error(`Failed to end least active session: ${error.message}`);
    } finally {
      timer.observeDuration();
    }
  }

  async countActiveSessions(userId: string): Promise<number> {
    const timer = trackDbOperation("countDocuments", "sessions");

    try {
      return await this.collection.countDocuments({ userId, isActive: true });
    } catch (error) {
      ErrorCounter.inc({
        type: "database",
        operation: "count_active_sessions",
      });
      throw new Error(`Failed to count active sessions: ${error.message}`);
    } finally {
      timer.observeDuration();
    }
  }
}
