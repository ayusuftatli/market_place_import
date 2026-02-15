import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { assertObjectId, requireString } from "../shared/http";
import { normalizeEnvironment } from "../configs/configSchema";
import { normalizeImportRequestBody, runImportPipeline } from "./importService";

export function createImportRouter(store: DataStore): Router {
  const router = Router();

  router.post(
    "/dry-run",
    asyncHandler(async (req, res) => {
      const result = await runImportPipeline(store, "dry-run", buildInput(req.body));
      res.status(201).json(result);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const result = await runImportPipeline(store, "commit", buildInput(req.body));
      res.status(201).json(result);
    })
  );

  return router;
}

function buildInput(body: Record<string, unknown>) {
  const clientId = requireString(body.clientId, "clientId");
  assertObjectId(clientId, "clientId");
  const environment = normalizeEnvironment(body.environment);
  const normalized = normalizeImportRequestBody(body);

  return {
    clientId,
    environment,
    ...normalized,
    records: body.records,
    content: body.content,
    csvContent: body.csvContent
  };
}
