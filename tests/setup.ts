import "dotenv/config";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { connectToDatabase, disconnectFromDatabase } from "../src/shared/database";

const appCollections = [
  "template_overrides",
  "import_runs",
  "order_summaries",
  "order_lines",
] as const;

beforeAll(async () => {
  await connectToDatabase();
});

beforeEach(async () => {
  await Promise.all(
    appCollections.map((collectionName) =>
      mongoose.connection.collection(collectionName).deleteMany({}),
    ),
  );
});

afterAll(async () => {
  await disconnectFromDatabase();
});
