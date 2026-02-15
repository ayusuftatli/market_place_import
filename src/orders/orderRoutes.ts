import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { notFound } from "../shared/errors";
import { assertObjectId, optionalString, requireString } from "../shared/http";

export function createOrderRouter(store: DataStore): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const clientId = optionalString(req.query.clientId);
      if (clientId) {
        assertObjectId(clientId, "clientId");
      }
      const orders = await store.orders.list({ clientId });
      res.json({ orders });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      assertObjectId(id);
      const order = await store.orders.findById(id);
      if (!order) {
        throw notFound("Order not found");
      }
      res.json(order);
    })
  );

  return router;
}
