import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";
import { requestApp } from "./httpTestClient";

describe("demo assets", () => {
  it("runs the checked-in Amazon and Shopify preview flows", async () => {
    const { app } = createTestContext();
    const amazonContent = readFileSync(
      "examples/data/amazon-orders-report.tsv",
      "utf8",
    );
    const shopifyContent = readFileSync(
      "examples/data/shopify-orders-export.csv",
      "utf8",
    );

    const amazonPreview = await requestApp(app, "POST", "/imports/preview", {
      templateKey: "amazon",
      inputKind: "delimited",
      fileName: "amazon-orders-report.tsv",
      content: amazonContent,
    });

    expect(amazonPreview.status).toBe(201);
    expect(amazonPreview.body).toMatchObject({
      totalRecords: 3,
      validRecords: 3,
      invalidRecords: 0,
      storedOrderCount: 0,
    });

    const shopifyPreview = await requestApp(app, "POST", "/imports/preview", {
      templateKey: "shopify",
      inputKind: "delimited",
      fileName: "shopify-orders-export.csv",
      content: shopifyContent,
    });

    expect(shopifyPreview.status).toBe(201);
    expect(shopifyPreview.body.orderPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceOrderId: "5001001",
          lineCount: 2,
          totalAmount: 139.11,
        }),
      ]),
    );
  });

  it("commits the checked-in generic JSON demo data", async () => {
    const { app, store } = createTestContext();
    const records = JSON.parse(
      readFileSync("examples/data/generic-marketplace-orders.json", "utf8"),
    );

    const commit = await requestApp(app, "POST", "/imports", {
      templateKey: "generic",
      inputKind: "records",
      fileName: "generic-marketplace-orders.json",
      records,
    });

    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({
      totalRecords: 2,
      validRecords: 2,
      invalidRecords: 0,
      storedOrderCount: 2,
      storedLineCount: 2,
    });

    const detail = await requestApp(app, "GET", `/imports/${commit.body.importRunId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.orders).toHaveLength(2);
    await expect(store.orderLines.count({ importRunId: commit.body.importRunId })).resolves.toBe(2);
  });
});
