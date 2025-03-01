import { connectToDb, dbConfig } from "../src/config/db.ts";
import { MongoClient, MongoClientOptions } from "npm:mongodb";
import "jsr:@std/dotenv/load";
import {
  assertExists,
  assert,
  assertEquals,
  assertRejects,
} from "jsr:@std/assert";

Deno.test("Database Connection", async (t) => {
  await t.step("Verify environment variables are set", () => {
    assertExists(Deno.env.get("MONGO_USERNAME"));
    assertExists(Deno.env.get("MONGO_PASSWORD"));
    assertExists(Deno.env.get("MONGO_URI"));
    assertExists(Deno.env.get("MONGO_DB"));
  });

  await t.step(
    "Connect to the database successfully with authentication",
    async () => {
      const client = await connectToDb();
      assertExists(client);
      assert(client instanceof MongoClient);

      // Test if we can actually connect and perform operations
      const db = client.db(dbConfig.dbName);
      const collections = await db.listCollections().toArray();
      assert(Array.isArray(collections));
    },
  );

  await t.step("Proper database configuration", () => {
    assert(dbConfig.uri.includes("mongodb://"));
    assertEquals(dbConfig.dbName, Deno.env.get("MONGO_DB"));
    assertEquals(
      dbConfig.maxPoolSize,
      parseInt(Deno.env.get("MONGO_MAX_POOL_SIZE")!),
    );
    assertEquals(
      dbConfig.minPoolSize,
      parseInt(Deno.env.get("MONGO_MIN_POOL_SIZE")!),
    );
    assertEquals(
      dbConfig.maxIdleTimeMS,
      parseInt(Deno.env.get("MONGO_MAX_CONN_IDLE_TIME")!) * 1000,
    );
  });

  await t.step("Fail with incorrect credentials", async () => {
    const invalidClient = new MongoClient(
      `mongodb://invalid:wrongpassword@localhost:27017/${dbConfig.dbName}`,
    );

    await assertRejects(async () => {
      await invalidClient.connect();
    });
  });

  await t.step("Access specified collections", async () => {
    const client = await connectToDb();
    const db = client.db(dbConfig.dbName);

    // Test access to your collections
    const collections = [
      Deno.env.get("USER_COLLECTION"),
      Deno.env.get("NOTE_COLLECTION"),
      Deno.env.get("TODO_COLLECTION"),
      Deno.env.get("SESSION_COLLECTION"),
    ];

    for (const collectionName of collections) {
      if (collectionName) {
        const collection = db.collection(collectionName);
        assertExists(collection);
        // Optional: Test if we can query the collection
        const count = await collection.countDocuments();
        assertEquals(typeof count, "number");
      }
    }
  });

  await t.step("Handle connection timeouts", async () => {
    // Test with a non-existent MongoDB server
    const timeoutClient = new MongoClient(
      "mongodb://localhost:27018", // Using wrong port
      { serverSelectionTimeoutMS: 1000 } as MongoClientOptions,
    );

    await assertRejects(async () => {
      await timeoutClient.connect();
    });
  });
});
