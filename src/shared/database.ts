import mongoose from "mongoose";

export async function connectToDatabase(uri = process.env.MONGODB_URI): Promise<void> {
  if (!uri) {
    throw new Error("MONGODB_URI is required to start the application.");
  }

  try {
    await mongoose.connect(uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to MongoDB at ${uri}: ${message}`);
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}
