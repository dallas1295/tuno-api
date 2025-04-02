import {
  MongoClient,
  MongoClientOptions,
  MongoNotConnectedError,
  MongoServerError,
} from "npm:mongodb";
import "@std/dotenv/load";

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
  ) as string}@localhost:27017/${Deno.env.get("MONGO_DB")}?authSource=admin`,
  maxPoolSize: parseInt(Deno.env.get("MONGO_MAX_POOL_SIZE") as string),
  minPoolSize: parseInt(Deno.env.get("MONGO_MIN_POOL_SIZE") as string),
  maxIdleTimeMS: parseInt(Deno.env.get("MONGO_MAX_CONN_IDLE_TIME") as string) *
    1000,
  dbName: Deno.env.get("MONGO_DB") as string,
};

let client: MongoClient | null = null;

export const connectToDb = async (): Promise<MongoClient> => {
  if (client) {
    console.log("Reusing existing MongoDB client instance");
    return client;
  }
  console.log("Creating new MongoDb instance");
  const options: Partial<MongoClientOptions> = {
    maxPoolSize: dbConfig.maxPoolSize,
    minPoolSize: dbConfig.minPoolSize,
    maxIdleTimeMS: dbConfig.maxIdleTimeMS,
  };
  client = new MongoClient(dbConfig.uri, options as MongoClientOptions);

  try {
    await client.connect();
    console.log("Connected to the database");
    return client;
  } catch (error) {
    console.error("Something went wrong connecting: ", error);
    throw new Error("Failed to connect to the database");
  }
};

export const closeDatabaseConnection = async (): Promise<void> => {
  if (client) {
    console.log("Closing MongoDB connection");
    try {
      await client.close();
      client = null;
      console.log("MongoDB connection closed");
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
    }
  } else {
    console.log("No MongoDB client to close");
  }
};

// Function to test the connection directly
async function testConnection() {
  let client: MongoClient | null = null;
  try {
    console.log("Attempting to connect to MongoDB...");
    client = await connectToDb();
    console.log("Successfully connected to MongoDB.");

    console.log("Attempting to close the connection...");
    await closeDatabaseConnection();
    console.log("Successfully closed the connection.");
  } catch (error) {
    console.error("Connection test failed:", error);
  } finally {
    if (client) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Delay
        await client.db().command({ ping: 1 });
        console.error("Client was not properly closed");
      } catch (pingError) {
        if (pingError instanceof MongoServerError) {
          console.log("ping error was caught Mongo closed");
        } else if (pingError instanceof MongoNotConnectedError) {
          console.log("Client successfully closed");
        } else {
          console.log("closing error ping was not caught: not closed");
          console.error("Ping error details:", pingError);
        }
      }
    }
  }
}

if (import.meta.main) {
  await testConnection();
}
