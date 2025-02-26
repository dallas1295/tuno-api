import { redisService } from "./redisService";
import { Session } from "../models/session";

class SessionCacheService {
  async setSession(session: Session): Promise<void> {
    const key = `session:${session.sessionId}`;
    const data = JSON.stringify(session);
    const ttl = Math.floor(
      (new Date(session.expiresAt).getTime() - Date.now()) / 1000,
    );
    if (ttl > 0) {
      await redisService.setKey(key, data, ttl);
    } else {
      throw new Error("Session has already expired");
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const key = `session:${sessionId}`;
    const data = await redisService.getKey(key);
    if (data) {
      const session: Session = JSON.parse(data);
      if (new Date(session.expiresAt).getTime() > Date.now()) {
        return session;
      } else {
        await this.deleteSession(sessionId);
        return null;
      }
    }
    return null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await redisService.deleteKey(key);
  }

  async clearCache(): Promise<void> {
    const pattern = "session:*";
    const keys = await redisService.getKeysByPattern(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => redisService.deleteKey(key)));
    }
  }

  async getAllSessions(): Promise<Session[]> {
    const pattern = "session:*";
    const keys = await redisService.getKeysByPattern(pattern);
    const sessions: Session[] = [];
    for (const key of keys) {
      const data = await redisService.getKey(key);
      if (data) {
        const session: Session = JSON.parse(data);
        if (new Date(session.expiresAt).getTime() > Date.now()) {
          sessions.push(session);
        } else {
          await this.deleteSession(session.sessionId);
        }
      }
    }
    return sessions;
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    const key = `session:${sessionId}`;
    return await redisService.keyExists(key);
  }
}

export const sessionCacheService = new SessionCacheService();
