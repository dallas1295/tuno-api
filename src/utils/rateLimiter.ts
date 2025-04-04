import { RateLimitInfo, RedisManager } from "../services/redisService.ts";

export class RateLimiter {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly BLOCK_DURATION = 900; // 15 minutes
  private static readonly WINDOW_SIZE = 300; // 5 minutes

  static getKey(type: "ip" | "user", value: string): string {
    return `ratelimit:${type}:${value}`;
  }

  static async isRateLimited(ip: string, username?: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);

    const ipKey = this.getKey("ip", ip);
    const ipInfo: RateLimitInfo | null = await RedisManager.getRateLimit(ipKey);

    if (ipInfo) {
      if (ipInfo.blocked && (now - ipInfo.lastAttempt) < this.BLOCK_DURATION) {
        return true;
      }

      if (
        ipInfo.attempts >= this.MAX_ATTEMPTS &&
        (now - ipInfo.firstAttempt) < this.WINDOW_SIZE
      ) {
        ipInfo.blocked = true;
        await RedisManager.setRateLimit(ipKey, ipInfo, this.BLOCK_DURATION);
        return true;
      }
    }

    if (username) {
      const userKey = this.getKey("user", username);
      const userInfo: RateLimitInfo | null = await RedisManager.getRateLimit(
        userKey,
      );

      if (userInfo) {
        if (
          userInfo.blocked && (now - userInfo.lastAttempt) < this.BLOCK_DURATION
        ) {
          return true;
        }

        if (
          userInfo.attempts >= this.MAX_ATTEMPTS &&
          (now - userInfo.firstAttempt) < this.WINDOW_SIZE
        ) {
          userInfo.blocked = true;
          await RedisManager.setRateLimit(
            userKey,
            userInfo,
            this.BLOCK_DURATION,
          );
          return true;
        }
      }
    }

    return false;
  }

  static async trackAttempt(ip: string, username?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // Track IP
    const ipKey = this.getKey("ip", ip);
    const ipInfo: RateLimitInfo = await RedisManager.getRateLimit(ipKey) || {
      attempts: 0,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false,
    };

    ipInfo.attempts++;
    ipInfo.lastAttempt = now;

    await RedisManager.setRateLimit(ipKey, ipInfo, this.WINDOW_SIZE);

    if (username) {
      const userKey = this.getKey("user", username);
      const userInfo: RateLimitInfo =
        await RedisManager.getRateLimit(userKey) || {
          attempts: 0,
          firstAttempt: now,
          lastAttempt: now,
          blocked: false,
        };

      userInfo.attempts++;
      userInfo.lastAttempt = now;

      await RedisManager.setRateLimit(userKey, userInfo, this.WINDOW_SIZE);
    }
  }

  static async resetAttempts(ip: string, username?: string): Promise<void> {
    await RedisManager.del(this.getKey("ip", ip));
    if (username) {
      await RedisManager.del(this.getKey("user", username));
    }
  }
}
