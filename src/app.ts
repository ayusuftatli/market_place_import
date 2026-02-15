import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createBatchRouter } from "./batches/batchRoutes";
import { createClientRouter } from "./clients/clientRoutes";
import { createConfigRouter } from "./configs/configRoutes";
import { createImportRouter } from "./imports/importRoutes";
import { createOrderRouter } from "./orders/orderRoutes";
import { getDefaultDataStore, type DataStore } from "./shared/dataStore";
import { errorHandler } from "./shared/errors";

export function createApp(options: { store?: DataStore } = {}) {
  const store = options.store ?? getDefaultDataStore();
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/clients", createClientRouter(store));
  app.use("/configs", createConfigRouter(store));
  app.use("/imports", createImportRouter(store));
  app.use("/batches", createBatchRouter(store));
  app.use("/orders", createOrderRouter(store));

  app.use(errorHandler);

  return app;
}

export const app = createApp();
