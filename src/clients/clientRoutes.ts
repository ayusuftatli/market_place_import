import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { notFound } from "../shared/errors";
import { assertObjectId, requireString } from "../shared/http";

export function createClientRouter(store: DataStore): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const code = requireString(req.body.code, "code");
      const name = requireString(req.body.name, "name");
      const client = await store.clients.create({ code, name });
      res.status(201).json(client);
    })
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const clients = await store.clients.list();
      res.json({ clients });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      assertObjectId(id);
      const client = await store.clients.findById(id);
      if (!client) {
        throw notFound("Client not found");
      }
      res.json(client);
    })
  );

  return router;
}
