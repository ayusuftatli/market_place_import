import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import type { ImportRequestInput } from "../shared/types";
import { requireString } from "../shared/http";
import { runImportPipeline } from "./importService";

export function createImportRouter(store: DataStore): Router {
  const router = Router();

  router.post(
    "/preview",
    asyncHandler(async (req, res) => {
      const result = await runImportPipeline(store, "preview", buildInput(req.body));
      res.status(201).json(result);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const result = await runImportPipeline(store, "commit", buildInput(req.body));
      res.status(201).json(result);
    }),
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const imports = await store.importRuns.list();
      res.json({ imports });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      const importRun = await store.importRuns.findById(id);
      if (!importRun) {
        res.status(404).json({ error: { message: "Import not found" } });
        return;
      }

      const orders = await store.orders.list({ importRunId: id });
      res.json({
        import: importRun,
        orders,
      });
    }),
  );

  return router;
}

function buildInput(body: Record<string, unknown>) {
  return {
    templateKey: requireString(body.templateKey, "templateKey"),
    inputKind: body.inputKind as ImportRequestInput["inputKind"],
    fileName: requireString(body.fileName, "fileName"),
    content: body.content,
    records: body.records,
  } satisfies ImportRequestInput;
}
