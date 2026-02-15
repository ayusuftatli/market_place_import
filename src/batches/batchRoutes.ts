import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { notFound } from "../shared/errors";
import { assertObjectId, optionalString, requireString } from "../shared/http";

export function createBatchRouter(store: DataStore): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const clientId = optionalString(req.query.clientId);
      if (clientId) {
        assertObjectId(clientId, "clientId");
      }
      const batches = await store.batches.list({ clientId });
      const enriched = await Promise.all(
        batches.map(async (batch) => ({
          ...batch,
          client: await store.clients.findById(batch.clientId)
        }))
      );
      res.json({ batches: enriched });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      assertObjectId(id);
      const batch = await store.batches.findById(id);
      if (!batch) {
        throw notFound("Batch not found");
      }
      res.json({
        ...batch,
        client: await store.clients.findById(batch.clientId)
      });
    })
  );

  return router;
}
