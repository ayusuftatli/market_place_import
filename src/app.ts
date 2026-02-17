import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { createImportRouter } from "./imports/importRoutes";
import { createOrderRouter } from "./orders/orderRoutes";
import { getDefaultDataStore, type DataStore } from "./shared/dataStore";
import { errorHandler } from "./shared/errors";
import { createTemplateRouter } from "./templates/templateRoutes";

export interface CreateAppOptions {
  store?: DataStore;
  uiDistPath?: string | false;
}

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? getDefaultDataStore();
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:", "https://images.unsplash.com"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/templates", createTemplateRouter(store));
  app.use("/imports", createImportRouter(store));
  app.use("/orders", createOrderRouter(store));

  mountUi(app, options.uiDistPath);

  app.use(errorHandler);

  return app;
}

export const app = createApp();

function mountUi(app: Express, uiDistPath: string | false | undefined): void {
  app.get("/", (_req, res) => {
    res.redirect("/ui");
  });

  const resolvedUiDistPath = resolveUiDistPath(uiDistPath);
  if (!resolvedUiDistPath) {
    return;
  }

  app.use("/ui", express.static(resolvedUiDistPath, { index: false }));
  app.get(/^\/ui(?:\/.*)?$/, (_req, res, next) => {
    try {
      res
        .type("html")
        .send(
          fs.readFileSync(path.join(resolvedUiDistPath, "index.html"), "utf8"),
        );
    } catch (error) {
      next(error);
    }
  });
}

function resolveUiDistPath(
  uiDistPath: string | false | undefined,
): string | null {
  if (uiDistPath === false) {
    return null;
  }

  if (typeof uiDistPath === "string") {
    return path.resolve(uiDistPath);
  }

  const candidates = [
    path.join(process.cwd(), "dist", "ui"),
    path.join(__dirname, "ui"),
  ];

  return candidates.find(hasIndexHtml) ?? null;
}

function hasIndexHtml(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "index.html"));
}
