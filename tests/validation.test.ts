import { describe, expect, it } from "vitest";
import {
  generateJsonSchema,
  validateNormalizedRecord
} from "../src/validation/schemaGenerator";
import { demoConfig } from "./helpers";

describe("generated validation schema", () => {
  it("generates JSON Schema properties and required fields", () => {
    const schema = generateJsonSchema(demoConfig());

    expect(schema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["externalOrderId", "customerEmail"])
    });
  });

  it("accepts a valid normalized order", () => {
    const errors = validateNormalizedRecord(
      demoConfig(),
      {
        externalOrderId: "1001",
        customerEmail: "sarah@example.com",
        orderTotal: 84.5,
        currency: "EUR",
        orderDate: "2026-04-10",
        status: "paid"
      },
      1
    );

    expect(errors).toEqual([]);
  });

  it("returns readable row-level errors", () => {
    const errors = validateNormalizedRecord(
      demoConfig(),
      {
        externalOrderId: "1002",
        customerEmail: "bad-email",
        orderTotal: -12,
        currency: "EUR",
        orderDate: "2026-04-11",
        status: "unknown"
      },
      2
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "customerEmail" }),
        expect.objectContaining({ row: 2, field: "orderTotal" }),
        expect.objectContaining({ row: 2, field: "status" })
      ])
    );
  });
});
