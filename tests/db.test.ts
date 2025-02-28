import {
  connectToDb,
  closeDatabaseConnection,
  dbConfig,
} from "../src/config/db";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

describe("Database Connection", () => {
  let client: MongoClient;

  beforeAll(() => {
    // Verify environment variables are set
    expect(process.env.MONGO_USERNAME).toBeDefined();
    expect(process.env.MONGO_PASSWORD).toBeDefined();
    expect(process.env.MONGO_URI).toBeDefined();
    expect(process.env.MONGO_DB).toBeDefined();
  });

  afterAll(async () => {
    await closeDatabaseConnection();
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Ensure all async operations are complete
  });

  it("should connect to the database successfully with authentication", async () => {
    client = await connectToDb();
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(MongoClient);

    // Test if we can actually connect and perform operations
    const db = client.db(dbConfig.dbName);
    const collections = await db.listCollections().toArray();
    expect(Array.isArray(collections)).toBeTruthy();
  });

  it("should have proper database configuration", () => {
    expect(dbConfig).toEqual({
      uri: expect.stringContaining("mongodb://"),
      dbName: process.env.MONGO_DB,
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE as string),
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE as string),
      maxIdleTimeMS:
        parseInt(process.env.MONGO_MAX_CONN_IDLE_TIME as string) * 1000, // Convert to milliseconds
    });
  });

  it("should fail with incorrect credentials", async () => {
    const invalidClient = new MongoClient(
      `mongodb://invalid:wrongpassword@localhost:27017/${dbConfig.dbName}`,
    );

    await expect(invalidClient.connect()).rejects.toThrow();
  });

  it("should be able to access specified collections", async () => {
    client = await connectToDb();
    const db = client.db(dbConfig.dbName);

    // Test access to your collections
    const collections = [
      process.env.USER_COLLECTION,
      process.env.NOTE_COLLECTION,
      process.env.TODO_COLLECTION,
      process.env.SESSION_COLLECTION,
    ];

    for (const collectionName of collections) {
      if (collectionName) {
        const collection = db.collection(collectionName);
        expect(collection).toBeDefined();
        // Optional: Test if we can query the collection
        const count = await collection.countDocuments();
        expect(typeof count).toBe("number");
      }
    }
  });

  it("should handle connection timeouts", async () => {
    // Test with a non-existent MongoDB server
    const timeoutClient = new MongoClient(
      "mongodb://localhost:27018", // Using wrong port
      { serverSelectionTimeoutMS: 1000 }, // Set a short timeout
    );

    await expect(timeoutClient.connect()).rejects.toThrow();
  });
});
