import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
      [
        "<!doctype html><html><head>",
        '<link rel="stylesheet" href="/ui/assets/index-test.css">',
        "</head><body><div id=\"root\">ui ready</div>",
        '<script type="module" src="/ui/assets/index-test.js"></script>',
        "</body></html>",
      ].join(""),
    );
    await mkdir(path.join(uiDistPath, "assets"));
    await writeFile(
      path.join(uiDistPath, "assets", "index-test.css"),
      "body { color: black; }",
    );
    await writeFile(
      path.join(uiDistPath, "assets", "index-test.js"),
      "console.log('ui ready');",
    );

    try {
      const { app } = createTestContext({ uiDistPath });

      const rootResponse = await requestApp(app, "GET", "/");
      expect(rootResponse.status).toBe(200);
      expect(rootResponse.text).toContain("ui ready");

      const uiRootResponse = await requestApp(app, "GET", "/ui/");
      expect(uiRootResponse.status).toBe(200);
      expect(uiRootResponse.text).toContain("ui ready");

      const uiResponse = await requestApp(app, "GET", "/stored-orders");
      expect(uiResponse.status).toBe(200);
      expect(uiResponse.text).toContain("ui ready");

      const fallbackResponse = await requestApp(app, "GET", "/anything/nested");
      expect(fallbackResponse.status).toBe(200);
      expect(fallbackResponse.text).toContain("ui ready");

      const stylesheetResponse = await requestApp(
        app,
        "HEAD",
        "/ui/assets/index-test.css",
      );
      expect(stylesheetResponse.status).toBe(200);
      expect(stylesheetResponse.headers["content-type"]).toContain("text/css");

      const scriptResponse = await requestApp(
        app,
        "HEAD",
        "/ui/assets/index-test.js",
      );
      expect(scriptResponse.status).toBe(200);
      expect(scriptResponse.headers["content-type"]).toMatch(/javascript/);

      const missingAssetResponse = await requestApp(
        app,
        "GET",
        "/ui/assets/missing.css",
      );
      expect(missingAssetResponse.status).toBe(404);
      expect(missingAssetResponse.text).not.toContain("ui ready");

      const healthResponse = await requestApp(app, "GET", "/health");
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body).toEqual({ status: "ok" });
    } finally {
      await rm(uiDistPath, { recursive: true, force: true });
    }
  });
});
