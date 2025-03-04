import { createClient } from "redis";
import type { RedisClientType } from "redis";
import "@std/dotenv/load";

const redisUrl = Deno.env.get("REDIS_URL");
if (!redisUrl) {
  throw new Error("Redis URL is not provided");
}

const client = createClient({
  url: redisUrl,
}) as RedisClientType;

client.on(
  "error",
  (error: Error) => console.log(`Redis client error ${error.message}`),
);

class RedisManager {
  private static client: RedisClientType = client;
  private static isConnected = false;

  public static async getClient(): Promise<RedisClientType> {
    try {
      if (!this.isConnected) {
        await this.client.connect();
        this.isConnected = true;
        console.log("Redis connection established");
      }
      return this.client;
    } catch (error) {
      this.isConnected = false;
      console.error(`Error connecting to Redis: ${error}`);
      throw new Error("Error connecting to Redis");
    }
  }
} // Close the class here

export const redisService = {
  setKey: async (
    key: string,
    value: string,
    expirationInSeconds: number,
  ): Promise<void> => {
    const client = await RedisManager.getClient();
    await client.set(key, value, { EX: expirationInSeconds });
  },

  getKey: async (key: string): Promise<string | null> => {
    const client = await RedisManager.getClient();
    return client.get(key);
  },

  deleteKey: async (key: string): Promise<void> => {
    const client = await RedisManager.getClient();
    await client.del(key);
  },

  keyExists: async (key: string): Promise<boolean> => {
    const client = await RedisManager.getClient();
    const exists = await client.exists(key);
    return exists > 0;
  },

  getKeysByPattern: async (pattern: string): Promise<string[]> => {
    const client = await RedisManager.getClient();
    return client.keys(pattern);
  },

  isConnected: async (): Promise<boolean> => {
    try {
      const client = await RedisManager.getClient();
      await client.ping();
      return true;
    } catch {
      return false;
    }
  },

  closeConnection: async (): Promise<void> => {
    try {
      const client = await RedisManager.getClient();
      await client.quit();
      RedisManager["isConnected"] = false;
    } catch (error) {
      console.error(`Error closing Redis connection: ${error}`);
      throw error;
    }
  },
};
