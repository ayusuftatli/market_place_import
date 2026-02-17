import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { notFound } from "../shared/errors";
import { optionalString, requireString } from "../shared/http";

export function createOrderRouter(store: DataStore): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const importRunId = optionalString(req.query.importRunId);
      const orders = await store.orders.list({ importRunId });
      res.json({ orders });
    }),
  );

  router.get(
    "/:id/lines",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      const order = await store.orders.findById(id);
      if (!order) {
        throw notFound("Order not found");
      }

      const lines = await store.orderLines.list({ orderId: id });
      res.json({ lines });
    }),
  );

  return router;
}
