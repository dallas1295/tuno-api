import { RedisClient } from "@iuioiua/redis";
import "@std/dotenv/load";

export interface RateLimitInfo {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
}

const redisPort = await Deno.connect({ port: 6379 });
const client = new RedisClient(redisPort);

export class RedisManager {
  private static client: RedisClient = client;

  public static async getClient(): Promise<RedisClient> {
    return this.client;
  }

  public static async ping(): Promise<boolean> {
    try {
      const reply = await this.client.sendCommand(["PING"]);
      return reply === "PONG";
    } catch (error) {
      console.error("Redis ping falied: ", error);
      return false;
    }
  }

  public static async del(key: string): Promise<boolean> {
    try {
      const reply = await this.client.sendCommand(["DEL", key]);
      return reply === 1;
    } catch (error) {
      console.error(`Redis DEL failed for key ${key}:`, error);
      return false;
    }
  }

  public static async keys(pattern: string): Promise<string[]> {
    try {
      const reply = await this.client.sendCommand(["KEYS", pattern]);
      return Array.isArray(reply) ? reply as string[] : [];
    } catch (error) {
      console.error(`Redis KEYS failed for pattern ${pattern}:`, error);
      return [];
    }
  }

  public static async setex(
    key: string,
    seconds: number,
    value: string,
  ): Promise<boolean> {
    try {
      const reply = await this.client.sendCommand([
        "SETEX",
        key,
        seconds.toString(),
        value,
      ]);
      return reply === "OK";
    } catch (error) {
      console.error(`Redis SETEX failed for key ${key}: `, error);
      return false;
    }
  }

  public static async getRateLimit(key: string): Promise<RateLimitInfo | null> {
    try {
      const reply = await this.client.sendCommand(["GET", key]);
      return reply ? JSON.parse(reply as string) : null;
    } catch (error) {
      console.error(`Redis GET failed for rate limit key ${key}:`, error);
      return null;
    }
  }

  public static async setRateLimit(
    key: string,
    info: RateLimitInfo,
    seconds: number,
  ): Promise<boolean> {
    try {
      const reply = await this.client.sendCommand([
        "SETEX",
        key,
        seconds.toString(),
        JSON.stringify(info),
      ]);
      return reply === "OK";
    } catch (error) {
      console.error(`Redis SETEX failed for rate limit key ${key}:`, error);
      return false;
    }
  }
}
