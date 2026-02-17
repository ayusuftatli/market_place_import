import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";
import { requestApp } from "./httpTestClient";

describe("UI static serving", () => {
  it("serves the built SPA without breaking API routes", async () => {
    const uiDistPath = await mkdtemp(path.join(tmpdir(), "order-import-ui-"));
    await writeFile(
      path.join(uiDistPath, "index.html"),
      '<!doctype html><html><body><div id="root">ui ready</div></body></html>',
    );

    try {
      const { app } = createTestContext({ uiDistPath });

      const rootResponse = await requestApp(app, "GET", "/");
      expect(rootResponse.status).toBe(302);
      expect(rootResponse.headers.location).toBe("/ui");

      const uiResponse = await requestApp(app, "GET", "/ui/");
      expect(uiResponse.status).toBe(200);
      expect(uiResponse.text).toContain("ui ready");

      const fallbackResponse = await requestApp(
        app,
        "GET",
        "/ui/imports/review",
      );
      expect(fallbackResponse.status).toBe(200);
      expect(fallbackResponse.text).toContain("ui ready");

      const healthResponse = await requestApp(app, "GET", "/health");
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body).toEqual({ status: "ok" });
    } finally {
      await rm(uiDistPath, { recursive: true, force: true });
    }
  });
});
