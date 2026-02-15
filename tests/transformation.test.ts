import { describe, expect, it } from "vitest";
import { mapAndTransformRecord } from "../src/transformation/transformer";
import { demoConfig } from "./helpers";

describe("mapping and transformation", () => {
  it("maps aliases into normalized order fields", () => {
    const result = mapAndTransformRecord(
      {
        id: "1001",
        "Customer Email": "SARAH@EXAMPLE.COM",
        Total: "84.50",
        Currency: "eur",
        "Order Date": "2026-04-10",
        Status: "Paid"
      },
      demoConfig()
    );

    expect(result.normalized.externalOrderId).toBe("1001");
    expect(result.normalized.customerEmail).toBe("sarah@example.com");
    expect(result.normalized.orderTotal).toBe(84.5);
    expect(result.normalized.currency).toBe("EUR");
    expect(result.normalized.status).toBe("paid");
    expect(result.sourceRecord).toHaveProperty("Customer Email");
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
});
