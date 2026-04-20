import "dotenv/config";
import { app } from "./app";
import { connectToDatabase, disconnectFromDatabase } from "./shared/database";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  await connectToDatabase();

  const server = app.listen(port, host, () => {
    console.log(`Marketplace import portal listening on http://${host}:${port}`);
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
