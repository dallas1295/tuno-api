import { MongoClient } from "mongodb";
import { trackDbOperation } from "./metrics";
import dotenv from "dotenv";

dotenv.config();

interface mongoConfig {
  uri: string;
  maxPoolSize: number;
  minPoolSize: number;
  maxConnIdleTime: number;
  retryWrites: boolean;
  database: string;
  username: string;
  password: string;
}

let mongoClient: MongoClient | null = null;

function getMongoConfig(): mongoConfig {
  const username = process.env.MONGO_USERNAME || "";
  const password = process.env.MONGO_PASSWORD || "";
  let uri = process.env.MONGO_URI || "";

  if (!uri && username && password) {
    uri = `mongodb://${username}:${password}@localhost:27017`;
  }

  return {
    uri,
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || "100", 10),
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || "10", 10),
    maxConnIdleTime:
      parseInt(process.env.MONGO_MAX_CONN_IDLE_TIME || "60", 10) * 1000,
    retryWrites: process.env.MONGO_RETRY_WRITES === "true",
    database: process.env.MONGO_DB || "tonotes",
    username,
    password,
  };
}

export async function initMongoClient(): Promise<void> {
  if (mongoClient) return;

  const config = getMongoConfig();

  if (!config.uri) {
    throw new Error("MongoDB URI is not set");
  }

  const client = new MongoClient(config.uri, {
    maxPoolSize: config.maxPoolSize,
    minPoolSize: config.minPoolSize,
    maxIdleTimeMS: config.maxConnIdleTime,
    retryWrites: config.retryWrites,
  });

  try {
    await client.connect();
    await client.db(config.database).command({ ping: 1 });
    mongoClient = client;
    console.log("Sucessfully connect to MongoDB");
  } catch (error) {
    console.error("Successfully connected to MongoDB");
    throw error;
  }
}

export async function checkMongoConnection(): Promise<void> {
  if (!mongoClient) {
    throw new Error("MongoDB client is not initialized");
  }

  try {
    await mongoClient.db().command({ ping: 1 });
    console.log("MongoDB connection is healthy");
  } catch (err) {
    console.error("Failed to ping MongoDB", err);
    throw err;
  }
}

export async function closeMongoConnection(): Promise<void> {
  if (mongoClient) {
    try {
      await mongoClient.close();
      console.log("MongoDB connection closed");
    } catch (err) {
      console.error("Error disconnecting from MongoDB", err);
      throw err;
    }
  }
}
