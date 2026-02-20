import { describe, expect, it } from "vitest";
import { runImportPipeline } from "../src/imports/importService";
import { createMongoDataStore } from "../src/shared/dataStore";
import { findSourceValue, mapAndTransformRecord } from "../src/transformation/transformer";
import { getBuiltInTemplate } from "../src/templates/builtInTemplates";
import { amazonTsv, genericJson } from "./helpers";

describe("mapping and rollups", () => {
  it("matches aliases across case, spaces, underscores, and punctuation", () => {
    expect(findSourceValue({ "Order ID": "1001" }, ["order_id"])).toBe("1001");
    expect(findSourceValue({ order_id: "1002" }, ["Order ID"])).toBe("1002");
    expect(findSourceValue({ "Customer-Email": "sarah@example.com" }, ["Customer Email"])).toBe(
      "sarah@example.com",
    );
  });

  it("maps and transforms Amazon source rows into normalized line fields", () => {
    const template = getBuiltInTemplate("amazon");
    if (!template) {
      throw new Error("Expected built-in Amazon template");
    }

    const result = mapAndTransformRecord(
      {
        "amazon-order-id": "112-1 ",
        "purchase-date": "2026-04-10T09:15:00Z",
        "order-status": "SHIPPED",
        currency: "eur",
        "product-name": "Cotton Sheet",
        quantity: "2",
        "item-price": "42.50",
      },
      template.lineFields,
      template.transforms,
    );

    expect(result.normalized).toMatchObject({
      sourceOrderId: "112-1",
      orderDate: "2026-04-10",
      orderStatus: "shipped",
      currency: "EUR",
      productTitle: "Cotton Sheet",
      quantity: 2,
      unitPriceAmount: 42.5,
    });
  });

  it("rolls line records up into summary totals and quantities", async () => {
    const store = createMongoDataStore();
    const result = await runImportPipeline(store, "preview", {
      templateKey: "generic",
      inputKind: "records",
      fileName: "generic.json",
      records: genericJson,
    });

    expect(result.orderPreview).toHaveLength(2);
    expect(result.orderPreview[0]).toMatchObject({
      sourceOrderId: "GEN-9101",
      totalAmount: 47.7,
      itemQuantity: 1,
      lineCount: 1,
    });
    expect(result.orderPreview[1]).toMatchObject({
      sourceOrderId: "GEN-9102",
      totalAmount: 55,
      itemQuantity: 2,
      lineCount: 1,
    });
  });

  it("accepts Amazon rows without customer PII", async () => {
    const store = createMongoDataStore();
    const result = await runImportPipeline(store, "preview", {
      templateKey: "amazon",
      inputKind: "delimited",
      fileName: "amazon-orders-report.tsv",
      content: amazonTsv,
    });

    expect(result.validRecords).toBe(3);
    expect(result.invalidRecords).toBe(0);
    expect(result.orderPreview[0].customerEmail).toBeUndefined();
    expect(result.orderPreview[0].customerName).toBeUndefined();
  });
});
