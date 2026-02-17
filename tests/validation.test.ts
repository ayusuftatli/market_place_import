import { describe, expect, it } from "vitest";
import {
  generateJsonSchema,
  validateNormalizedRecord,
  validateNormalizedRecords
} from "../src/validation/schemaGenerator";
import { demoConfig } from "./helpers";

describe("generated validation schema", () => {
  it("generates JSON Schema properties and required fields", () => {
    const config = demoConfig();
    config.fields.orderTotal.max = 500;
    const schema = generateJsonSchema(config);

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: true,
      required: expect.arrayContaining([
        "externalOrderId",
        "customerEmail",
        "orderTotal",
        "currency",
        "orderDate",
        "status"
      ]),
      properties: {
        customerEmail: {
          type: "string",
          format: "email"
        },
        orderTotal: {
          type: "number",
          minimum: 0,
          maximum: 500
        },
        orderDate: {
          type: "string",
          format: "date"
        },
        status: {
          type: "string",
          enum: ["paid", "pending", "cancelled", "refunded"]
        }
      }
    });
  });

  it("accepts a valid normalized order", () => {
    const errors = validateNormalizedRecord(demoConfig(), validOrder(), 1);

    expect(errors).toEqual([]);
  });

  it("rejects missing required fields", () => {
    const { externalOrderId: _externalOrderId, ...record } = validOrder();

    const errors = validateNormalizedRecord(
      demoConfig(),
      record,
      2
    );
    const error = errors.find(
      (candidate) => candidate.field === "externalOrderId"
    );

    expect(error).toMatchObject({
      row: 2,
      field: "externalOrderId",
      message: "externalOrderId is required"
    });
    expect(error).toHaveProperty("value", undefined);
  });

  it("rejects invalid emails with row-level values", () => {
    const errors = validateNormalizedRecord(
      demoConfig(),
      validOrder({ customerEmail: "bad-email" }),
      2
    );

    expect(errors).toContainEqual(
      expect.objectContaining({
        row: 2,
        field: "customerEmail",
        message: "customerEmail must match format 'email'",
        value: "bad-email"
      })
    );
  });

  it("rejects negative order totals", () => {
    const errors = validateNormalizedRecord(
      demoConfig(),
      validOrder({ orderTotal: -12 }),
      3
    );

    expect(errors).toContainEqual(
      expect.objectContaining({
        row: 3,
        field: "orderTotal",
        message: "orderTotal must be >= 0",
        value: -12
      })
    );
  });

  it("rejects unsupported enum values", () => {
    const errors = validateNormalizedRecord(
      demoConfig(),
      validOrder({ status: "shipped" }),
      4
    );

    expect(errors).toContainEqual(
      expect.objectContaining({
        row: 4,
        field: "status",
        message: "status must be one of the allowed values",
        value: "shipped"
      })
    );
  });

  it("limits returned errors to settings.maxErrors", () => {
    const summary = validateNormalizedRecords(
      demoConfig({
        settings: {
          allowPartialSuccess: true,
          maxErrors: 2,
          previewLimit: 10
        }
      }),
      [
        {
          customerEmail: "bad-email",
          orderTotal: -12,
          currency: "AUD",
          orderDate: "not-a-date",
          status: "shipped"
        },
        {
          customerEmail: "also-bad",
          orderTotal: -1,
          currency: "CAD",
          orderDate: "2026-04-11",
          status: "unknown"
        }
      ]
    );

    expect(summary.validRecords).toBe(0);
    expect(summary.invalidRecords).toBe(2);
    expect(summary.errors).toHaveLength(2);
    expect(summary.errors.every((error) => error.row === 1)).toBe(true);
  });
});

function validOrder(overrides: Record<string, unknown> = {}) {
  return {
    externalOrderId: "1001",
    customerEmail: "sarah@example.com",
    orderTotal: 84.5,
    currency: "EUR",
    orderDate: "2026-04-10",
    status: "paid",
    ...overrides
  };
}
