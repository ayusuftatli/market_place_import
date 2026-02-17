import { describe, expect, it } from "vitest";
import { createTestContext, amazonTsv, genericCsv, genericMixedJson, shopifyCsv } from "./helpers";
import { requestApp } from "./httpTestClient";

describe("marketplace import API", () => {
  it("returns health status", async () => {
    const { app } = createTestContext();

    const response = await requestApp(app, "GET", "/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("lists templates and returns template detail", async () => {
    const { app } = createTestContext();

    const list = await requestApp(app, "GET", "/templates");
    expect(list.status).toBe(200);
    expect(list.body.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "amazon" }),
        expect.objectContaining({ key: "shopify" }),
        expect.objectContaining({ key: "generic" }),
      ]),
    );

    const detail = await requestApp(app, "GET", "/templates/shopify");
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      template: {
        key: "shopify",
        label: "Shopify Order Export",
      },
      builtInContent: {
        yaml: expect.stringContaining("key: shopify"),
        json: expect.stringContaining('"key": "shopify"'),
      },
      override: null,
    });
  });

  it("saves and removes template overrides", async () => {
    const { app } = createTestContext();
    const updatedContent = `
key: generic
label: Generic Spreadsheet
description: Custom agency flavor
acceptedFileKinds:
  - csv
  - json
sampleFileName: generic-marketplace-orders.csv
templateVersion: 1
lineFields:
  sourceOrderId:
    type: string
    required: true
    aliases:
      - Order ID
  orderDate:
    type: string
    required: true
    format: date
    aliases:
      - Order Date
  orderStatus:
    type: string
    required: true
    aliases:
      - Status
  currency:
    type: string
    required: true
    aliases:
      - Currency
  productTitle:
    type: string
    required: true
    aliases:
      - Product
  quantity:
    type: number
    required: true
    min: 1
    aliases:
      - Quantity
orderRollup:
  keyField: sourceOrderId
  fields:
    sourceOrderId:
      type: string
      required: true
      fromLineField: sourceOrderId
      aggregate: first
    salesChannel:
      type: string
      value: custom
    orderDate:
      type: string
      required: true
      format: date
      fromLineField: orderDate
      aggregate: first
    orderStatus:
      type: string
      required: true
      fromLineField: orderStatus
      aggregate: first
    currency:
      type: string
      required: true
      fromLineField: currency
      aggregate: first
    subtotalAmount:
      type: number
      fromLineField: quantity
      aggregate: sum
    shippingAmount:
      type: number
      value: 0
    taxAmount:
      type: number
      value: 0
    discountAmount:
      type: number
      value: 0
    totalAmount:
      type: number
    itemQuantity:
      type: number
      fromLineField: quantity
      aggregate: sum
    lineCount:
      type: number
      aggregate: count
settings:
  allowPartialSuccess: true
  maxErrors: 20
  previewLimit: 5
`;

    const saved = await requestApp(app, "PUT", "/templates/generic/override", {
      format: "yaml",
      content: updatedContent,
    });

    expect(saved.status).toBe(200);
    expect(saved.body.override).toMatchObject({
      format: "yaml",
      templateVersion: 2,
    });
    expect(saved.body.template.description).toBe("Custom agency flavor");

    const restored = await requestApp(app, "DELETE", "/templates/generic/override");
    expect(restored.status).toBe(200);
    expect(restored.body.override).toBeNull();
  });

  it("previews Amazon TSV imports with rolled-up summaries", async () => {
    const { app } = createTestContext();

    const preview = await requestApp(app, "POST", "/imports/preview", {
      templateKey: "amazon",
      inputKind: "delimited",
      fileName: "amazon-orders-report.tsv",
      content: amazonTsv,
    });

    expect(preview.status).toBe(201);
    expect(preview.body).toMatchObject({
      templateVersion: 1,
      totalRecords: 3,
      validRecords: 3,
      invalidRecords: 0,
      storedOrderCount: 0,
      storedLineCount: 0,
    });
    expect(preview.body.orderPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceOrderId: "112-9739103-000001",
          salesChannel: "Amazon.de",
          totalAmount: 96.98,
        }),
        expect.objectContaining({
          sourceOrderId: "112-9739103-000002",
          lineCount: 2,
          itemQuantity: 3,
          totalAmount: 76.53,
        }),
      ]),
    );
  });

  it("previews Shopify CSV imports after carry-forward normalization", async () => {
    const { app } = createTestContext();

    const preview = await requestApp(app, "POST", "/imports/preview", {
      templateKey: "shopify",
      inputKind: "delimited",
      fileName: "shopify-orders-export.csv",
      content: shopifyCsv,
    });

    expect(preview.status).toBe(201);
    expect(preview.body.orderPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceOrderId: "5001001",
          sourceOrderName: "#1001",
          lineCount: 2,
          itemQuantity: 3,
          totalAmount: 139.11,
        }),
      ]),
    );
    expect(preview.body.linePreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceOrderId: "5001001",
          productTitle: "Cashmere Throw",
        }),
        expect.objectContaining({
          sourceOrderId: "5001001",
          productTitle: "Brass Candle Holder",
        }),
      ]),
    );
  });

  it("commits generic CSV imports and exposes recent import details with line drill-down", async () => {
    const { app, store } = createTestContext();

    const commit = await requestApp(app, "POST", "/imports", {
      templateKey: "generic",
      inputKind: "delimited",
      fileName: "generic-marketplace-orders.csv",
      content: genericCsv,
    });

    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({
      totalRecords: 3,
      validRecords: 3,
      invalidRecords: 0,
      storedOrderCount: 2,
      storedLineCount: 3,
    });

    const imports = await requestApp(app, "GET", "/imports");
    expect(imports.status).toBe(200);
    expect(imports.body.imports).toHaveLength(1);

    const detail = await requestApp(app, "GET", `/imports/${commit.body.importRunId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.orders).toHaveLength(2);

    const firstOrder = detail.body.orders[0];
    const lines = await requestApp(app, "GET", `/orders/${firstOrder.id}/lines`);
    expect(lines.status).toBe(200);
    expect(lines.body.lines.length).toBeGreaterThan(0);

    const storedOrders = await store.orders.list({ importRunId: commit.body.importRunId });
    expect(storedOrders).toHaveLength(2);
    await expect(store.orderLines.count({ importRunId: commit.body.importRunId })).resolves.toBe(3);
  });

  it("commits valid rows when partial success is allowed", async () => {
    const { app } = createTestContext();

    const commit = await requestApp(app, "POST", "/imports", {
      templateKey: "generic",
      inputKind: "records",
      fileName: "generic-mixed.json",
      records: genericMixedJson,
    });

    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({
      totalRecords: 3,
      validRecords: 2,
      invalidRecords: 1,
      storedOrderCount: 2,
      storedLineCount: 2,
    });
    expect(commit.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 3,
          field: "productTitle",
        }),
        expect.objectContaining({
          row: 3,
          field: "quantity",
        }),
      ]),
    );
  });
});
