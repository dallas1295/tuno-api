import { RedisClient } from "@iuioiua/redis";
import "@std/dotenv/load";

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
}
