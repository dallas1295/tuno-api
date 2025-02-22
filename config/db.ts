import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

export interface DbConfig {
  uri: string;
  maxPoolSize: number;
  minPoolSize: number;
  maxIdleTimeMS: number;
  dbName: string;
}

export const dbConfig: DbConfig = {
  uri: process.env.MONGO_URI as string,
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE as string),
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE as string),
  maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME_MS as string),
  dbName: process.env.MONGO_DB as string,
};

export const connectToDb = async (): Promise<MongoClient> => {
  try {
    const client = new MongoClient(dbConfig.uri, {
      maxPoolSize: dbConfig.maxPoolSize,
      minPoolSize: dbConfig.minPoolSize,
      maxIdleTimeMS: dbConfig.maxIdleTimeMS,
    });

    await client.connect();
    console.log("Connected to the database");
    return client;
  } catch (error) {
    console.error("Something went wrong connecing: ", error);
    process.exit(1);
  }
};
