/**
 * @file This module defines the database configuration for the tonotes-server.
 * It uses environment variables to configure the MongoDB connection and exports
 * a configuration object and a function to connect to the database.
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

/**
 * Interface defining the structure of the database configuration.
 */

export interface DbConfig {
  uri: string;
  /**
   * The MongoDB connection URI.  This should include the username, password, host,
   * and port.  Example: `mongodb://user:password@host:port/`.  This value *must*
   * be a valid MongoDB connection string.
   *
   * @env MONGO_URI
   */

  maxPoolSize: number;
  /**
   * The minimum number of connections that the connection pool will attempt to maintain.
   * Maintaining a minimum pool size can improve performance by reducing connection
   * establishment latency.
   *
   * @env MONGO_MIN_POOL_SIZE
   */

  minPoolSize: number;
  /**
   * The maximum amount of time (in milliseconds) that a connection can remain idle
   * in the connection pool before being closed. Reducing this value can help reclaim
   * resources if connections are not being actively used.
   *
   * @env MONGO_MAX_CONN_IDLE_TIME_MS
   */

  maxIdleTimeMS: number;
  /**
   * The name of the MongoDB database to connect to.
   *
   * @env MONGO_DB
   */
  dbName: string;
}

export const dbConfig: DbConfig = {
  uri: `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@localhost:27017/?authSource=admin`,
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE as string),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE as string),
  maxIdleTimeMS:
    parseInt(process.env.MONGO_MAX_CONN_IDLE_TIME as string) * 1000,
  dbName: process.env.MONGO_DB as string,
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
  client = new MongoClient(dbConfig.uri, {
    maxPoolSize: dbConfig.maxPoolSize,
    minPoolSize: dbConfig.minPoolSize,
    maxIdleTimeMS: dbConfig.maxIdleTimeMS,
  });

  try {
    await client.connect();
    console.log("Connected to the database");
    return client;
  } catch (error) {
    console.error("Something went wrong connecing: ", error);
    process.exit(1);
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
