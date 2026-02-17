import { describe, expect, it } from "vitest";
import { getBuiltInTemplate } from "../src/templates/builtInTemplates";
import { parseTemplatePayload } from "../src/templates/templateSchema";
import {
  createRecordValidator,
  generateJsonSchema,
} from "../src/validation/schemaGenerator";

describe("template and record validation", () => {
  it("generates JSON Schema properties and required fields for line mappings", () => {
    const template = getBuiltInTemplate("generic");
    if (!template) {
      throw new Error("Expected built-in generic template");
    }

    const schema = generateJsonSchema(template.lineFields);

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: true,
      required: expect.arrayContaining([
        "sourceOrderId",
        "orderDate",
        "orderStatus",
        "currency",
        "productTitle",
        "quantity",
      ]),
      properties: {
        customerEmail: {
          type: "string",
          format: "email",
        },
        quantity: {
          type: "number",
          minimum: 1,
        },
      },
    });
  });

  it("rejects invalid customer emails in normalized lines", () => {
    const template = getBuiltInTemplate("generic");
    if (!template) {
      throw new Error("Expected built-in generic template");
    }

    const validate = createRecordValidator(template.lineFields);
    const result = validate(
      {
        sourceOrderId: "GEN-1",
        orderDate: "2026-04-14",
        orderStatus: "paid",
        currency: "EUR",
        customerEmail: "bad-email",
        productTitle: "Tray",
        quantity: 1,
      },
      2,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        row: 2,
        field: "customerEmail",
        message: "customerEmail must match format 'email'",
        value: "bad-email",
      }),
    );
  });

  it("rejects override templates that reference missing rollup fields", () => {
    const invalidTemplate = JSON.stringify({
      key: "generic",
      label: "Broken Generic",
      acceptedFileKinds: ["csv"],
      sampleFileName: "broken.csv",
      lineFields: {
        sourceOrderId: {
          type: "string",
          required: true,
        },
      },
      orderRollup: {
        keyField: "sourceOrderId",
        fields: {
          sourceOrderId: {
            type: "string",
            fromLineField: "sourceOrderId",
            aggregate: "first",
          },
          subtotalAmount: {
            type: "number",
            fromLineField: "missingField",
            aggregate: "sum",
          },
        },
      },
    });

    expect(() =>
      parseTemplatePayload({
        format: "json",
        content: invalidTemplate,
      }),
    ).toThrow("references unknown line field 'missingField'");
  });
});
