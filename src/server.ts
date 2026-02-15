import "dotenv/config";
import { app } from "./app";
import { connectToDatabase, disconnectFromDatabase } from "./shared/database";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);

  if (process.env.DATA_STORE !== "memory") {
    await connectToDatabase();
  }

  const server = app.listen(port, () => {
    console.log(`Order import API listening on http://localhost:${port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await disconnectFromDatabase();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
