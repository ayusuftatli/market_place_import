import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { notFound } from "../shared/errors";
import { assertObjectId, optionalString, requireString } from "../shared/http";
import type { Environment } from "../shared/types";
import { normalizeEnvironment, parseConfigPayload } from "./configSchema";
import { createImportConfig, promoteImportConfig } from "./configService";

export function createConfigRouter(store: DataStore): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const clientId = requireString(req.body.clientId, "clientId");
      assertObjectId(clientId, "clientId");
      const parsed = parseConfigPayload({
        format: req.body.format,
        content: req.body.content,
        config: req.body.config,
        environment: req.body.environment
      });
      const environment = normalizeEnvironment(
        req.body.environment ?? parsed.config.environment
      );
      const config = await createImportConfig(store, {
        clientId,
        environment,
        format: parsed.format,
        config: parsed.config
      });

      res.status(201).json(config);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const clientId = optionalString(req.query.clientId);
      const environment = req.query.environment
        ? normalizeEnvironment(req.query.environment)
        : undefined;

      if (clientId) {
        assertObjectId(clientId, "clientId");
      }

      const filter: { clientId?: string; environment?: Environment } = {};
      if (clientId) {
        filter.clientId = clientId;
      }
      if (environment) {
        filter.environment = environment;
      }

      const configs = await store.configs.list(filter);
      res.json({ configs });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      assertObjectId(id);
      const config = await store.configs.findById(id);
      if (!config) {
        throw notFound("Config not found");
      }
      res.json(config);
    })
  );

  router.post(
    "/:id/promote",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      assertObjectId(id);
      const config = await promoteImportConfig(store, id);
      res.status(201).json(config);
    })
  );

  return router;
}
