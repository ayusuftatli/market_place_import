import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { requireString } from "../shared/http";
import {
  deleteTemplateOverride,
  getTemplateDetail,
  listTemplates,
  upsertTemplateOverride,
} from "./templateService";

export function createTemplateRouter(store: DataStore): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const templates = await listTemplates(store);
      res.json({ templates });
    }),
  );

  router.get(
    "/:key",
    asyncHandler(async (req, res) => {
      const key = requireString(req.params.key, "key");
      const detail = await getTemplateDetail(store, key);
      res.json(detail);
    }),
  );

  router.put(
    "/:key/override",
    asyncHandler(async (req, res) => {
      const key = requireString(req.params.key, "key");
      const detail = await upsertTemplateOverride(store, key, {
        format: req.body.format,
        content: req.body.content,
      });
      res.status(200).json(detail);
    }),
  );

  router.delete(
    "/:key/override",
    asyncHandler(async (req, res) => {
      const key = requireString(req.params.key, "key");
      const detail = await deleteTemplateOverride(store, key);
      res.json(detail);
    }),
  );

  return router;
}
