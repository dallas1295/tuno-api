import { Collection, MongoClient, UpdateResult } from "mongodb";
import { Session } from "../models/session";
import { createContext } from "../utils/context";
import { SessionCache, GlobalSessionCache } from "../utils/cache";
import { ErrorCounter, trackDbOperation } from "../utils/metrics";
import dotenv from "dotenv";
dotenv.config();

export class TodoRepo {
  private collection: Collection<Session>;

  constructor(db: MongoClient) {
    const dbName = process.env.MONGO_DB as string;
    const collectionName = process.env.SESSIO_COLLECTION as string;
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
}
