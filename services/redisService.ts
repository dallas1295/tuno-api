import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisURL: string = process.env.REDIS_URL as string;

if (!redisURL) {
  throw new Error("Redis URL is not provided");
}

const client = createClient({ url: redisURL });

client.on("error", (error) => console.log(`Redis client error ${error}`));
await client.connect();

export const redisService = {
  setKey: async (
    key: string,
    value: string,
    expirationInSeconds: number,
  ): Promise<void> => {
    await client.set(key, value, { EX: expirationInSeconds });
  },
  getKey: async (key: string): Promise<string | null> => {
    return await client.get(key);
  },
  deleteKey: async (key: string): Promise<void> => {
    await client.del(key);
  },
  keyExists: async (key: string): Promise<boolean> => {
    const exists = await client.exists(key);
    return exists > 0;
  },
  getKeysByPattern: async (pattern: string): Promise<string[]> => {
    return await client.keys(pattern);
  },
  isConnected: async (): Promise<boolean> => {
    try {
      await client.ping();
      return true;
    } catch {
      return false;
    }
  },
  closeConnectoin: async (): Promise<void> => {
    await client.quit();
  },
};
