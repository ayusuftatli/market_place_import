import { describe, expect, it } from "vitest";
import { buildImportRequest } from "../ui/src/api";
import { DEMO_CSV } from "../ui/src/demoData";
import { createCsvSource, createJsonSource } from "../ui/src/importFiles";

describe("UI API request builders", () => {
  it("builds CSV import payloads for the existing API", () => {
    const payload = buildImportRequest({
      clientId: "client-1",
      environment: "development",
      configVersion: 3,
      source: createCsvSource("orders.csv", DEMO_CSV),
    });

    expect(payload).toMatchObject({
      clientId: "client-1",
      environment: "development",
      configVersion: 3,
      sourceType: "csv",
      csvContent: DEMO_CSV,
    });
    expect(payload).not.toHaveProperty("records");
  });

  it("builds JSON import payloads for browser-parsed Excel records", () => {
    const payload = buildImportRequest({
      clientId: "client-1",
      environment: "production",
      source: createJsonSource("orders.xlsx", [{ order_id: "1001" }]),
    });

    expect(payload).toEqual({
      clientId: "client-1",
      environment: "production",
      sourceType: "json",
      records: [{ order_id: "1001" }],
    });
    expect(payload).not.toHaveProperty("configVersion");
  });
});
