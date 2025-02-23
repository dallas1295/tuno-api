import { Session } from "../models/session";

export class SessionCache {
  private cache: Map<string, Session> = new Map();

  async setSession(session: Session): Promise<void> {
    this.cache.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.cache.get(sessionId) || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.cache.delete(sessionId);
  }

  async incrementSessionVersion(userId: string): Promise<void> {
    // Implement version increment logic
  }
}

export const GlobalSessionCache = new SessionCache();
