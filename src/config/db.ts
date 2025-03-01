/**
 * @file This module defines the database configuration for the tonotes-server.
 * It uses environment variables to configure the MongoDB connection and exports
 * a configuration object and a function to connect to the database.
 */

import { MongoClient, MongoClientOptions } from "mongodb";
import "jsr:@std/dotenv/load";

/**
 * Interface defining the structure of the database configuration.
 */

export interface DbConfig {
  uri: string;
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS: number;
  dbName: string;
}

export const dbConfig: DbConfig = {
  uri: `mongodb://${Deno.env.get("MONGO_USERNAME")}:${Deno.env.get(
    "MONGO_PASSWORD",
  )}@${Deno.env.get("MONGO_URI")}/?authSource=admin`,
  maxPoolSize: parseInt(Deno.env.get("MONGO_MAX_POOL_SIZE")!),
  minPoolSize: parseInt(Deno.env.get("MONGO_MIN_POOL_SIZE")!),
  maxIdleTimeMS: parseInt(Deno.env.get("MONGO_MAX_CONN_IDLE_TIME")!) * 1000,
  dbName: Deno.env.get("MONGO_DB")!,
};

/**
 * Asynchronously connects to the MongoDB database using the configured settings.
 *
 * @returns A Promise that resolves to a MongoClient instance if the connection is successful.
 * @throws If the connection fails, the function logs an error to the console and exits the process.
 */
let client: MongoClient | null = null;

export const connectToDb = async (): Promise<MongoClient> => {
  if (client) {
    console.log("Reusing existing MongDB client instance");
    return client;
  }
  console.log("Creating new MongoDb instance");
  const options: Partial<MongoClientOptions> = {
    maxPoolSize: dbConfig.maxPoolSize,
    minPoolSize: dbConfig.minPoolSize,
    maxIdleTimeMS: dbConfig.maxIdleTimeMS,
  };
  client = new MongoClient(dbConfig.uri, options as MongoClientOptions); // Type assertion here

  try {
    await client.connect();
    console.log("Connected to the database");
    return client;
  } catch (error) {
    console.error("Something went wrong connecing: ", error);
    Deno.exit(1);
  }
};
export const closeDatabaseConnection = async (): Promise<void> => {
  if (client) {
    console.log("Closing MongoDB connection");
    try {
      await client.close();
      console.log("MongoDB connection closed");
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
    } finally {
      client = null;
      console.log("MongoDB reset to null");
    }
  } else {
    console.log("No MongoDB client to close");
  }
};
