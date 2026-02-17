import { describe, expect, it } from "vitest";
import type { ImportTemplate } from "../src/shared/types";
import {
  findSourceValue,
  mapAndTransformRecord
} from "../src/transformation/transformer";
import { demoConfig } from "./helpers";

describe("mapping and transformation", () => {
  it("matches aliases across case, spaces, underscores, and punctuation", () => {
    expect(findSourceValue({ "Order ID": "1001" }, ["Order ID"])).toBe("1001");
    expect(findSourceValue({ order_id: "1002" }, ["Order ID"])).toBe("1002");
    expect(findSourceValue({ ID: "1003" }, ["id"])).toBe("1003");
    expect(
      findSourceValue(
        { "Customer-Email": "sarah@example.com" },
        ["Customer Email"]
      )
    ).toBe("sarah@example.com");
  });

  it("maps aliases into normalized order fields", () => {
    const sourceRecord = {
      id: "1001",
      "Customer Email": "SARAH@EXAMPLE.COM",
      Total: "84.50",
      Currency: "eur",
      "Order Date": "2026-04-10",
      Status: "Paid"
    };
    const result = mapAndTransformRecord(
      sourceRecord,
      demoConfig()
    );

    expect(result.normalized.externalOrderId).toBe("1001");
    expect(result.normalized.customerEmail).toBe("sarah@example.com");
    expect(result.normalized.orderTotal).toBe(84.5);
    expect(result.normalized.currency).toBe("EUR");
    expect(result.normalized.status).toBe("paid");
    expect(result.sourceRecord).toHaveProperty("Customer Email");
    expect(result.sourceRecord).toEqual(sourceRecord);
    expect(result.sourceRecord).not.toBe(sourceRecord);
  });

  it("applies transforms in configured order", () => {
    const result = mapAndTransformRecord(
      {},
      template({
        fields: {
          currency: {
            type: "string",
            aliases: ["Currency"]
          }
        },
        transforms: {
          currency: [{ type: "default", value: "eur" }, "uppercase"]
        }
      })
    );

    expect(result.normalized.currency).toBe("EUR");
  });

  it("maps enum values case-insensitively", () => {
    const config = template({
      fields: {
        status: {
          type: "string",
          aliases: ["Status"]
        }
      },
      transforms: {
        status: [
          "trim",
          "lowercase",
          {
            type: "enumMap",
            map: {
              paid: "paid",
              complete: "paid"
            }
          }
        ]
      }
    });
    const paid = mapAndTransformRecord({ Status: "PAID" }, config);
    const complete = mapAndTransformRecord({ Status: "complete" }, config);

    expect(paid.normalized.status).toBe("paid");
    expect(complete.normalized.status).toBe("paid");
  });

  it("coerces numeric strings", () => {
    const result = mapAndTransformRecord(
      { Total: "1,234.56" },
      template({
        fields: {
          orderTotal: {
            type: "number",
            aliases: ["Total"]
          }
        },
        transforms: {
          orderTotal: ["trim", "numberCoerce"]
        }
      })
    );

    expect(result.normalized.orderTotal).toBe(1234.56);
  });

  it("normalizes date strings to YYYY-MM-DD", () => {
    const result = mapAndTransformRecord(
      { "Order Date": "2026-04-10T13:15:00.000Z" },
      template({
        fields: {
          orderDate: {
            type: "string",
            aliases: ["Order Date"]
          }
        },
        transforms: {
          orderDate: ["trim", "dateNormalize"]
        }
      })
    );

    expect(result.normalized.orderDate).toBe("2026-04-10");
  });

  it("applies defaults for missing optional values", () => {
    const result = mapAndTransformRecord(
      {
        "Order ID": "1001",
        "Customer Email": "sarah@example.com",
        Total: "84.50",
        Currency: "eur",
        "Order Date": "2026-04-10",
        Status: "complete"
      },
      demoConfig()
    );

    expect(result.normalized.customerName).toBe("Unknown Customer");
    expect(result.normalized.status).toBe("paid");
  });

  it("rejects unsupported transforms instead of silently ignoring them", () => {
    expect(() =>
      mapAndTransformRecord(
        { Total: "84.50" },
        template({
          fields: {
            orderTotal: {
              type: "number",
              aliases: ["Total"]
            }
          },
          transforms: {
            orderTotal: [{ type: "currencyCoerce" } as never]
          }
        })
      )
    ).toThrow("Unsupported transform 'currencyCoerce'");
  });
});

function template(
  overrides: Pick<ImportTemplate, "fields"> & Partial<ImportTemplate>
): ImportTemplate {
  return {
    environment: "development",
    source: {
      type: "csv"
    },
    ...overrides
  };
}
