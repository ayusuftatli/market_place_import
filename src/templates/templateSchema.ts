import Ajv from "ajv";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { badRequest } from "../shared/errors";
import type {
  ConfigFormat,
  MarketplaceTemplate,
  RollupFieldConfig,
  TransformStep,
} from "../shared/types";

const transformNames = [
  "uppercase",
  "lowercase",
  "trim",
  "default",
  "source",
  "enumMap",
  "numberCoerce",
  "dateNormalize",
] as const;

const supportedFieldFormats = new Set([
  "date",
  "time",
  "date-time",
  "duration",
  "uri",
  "uri-reference",
  "uri-template",
  "url",
  "email",
  "hostname",
  "ipv4",
  "ipv6",
  "regex",
  "uuid",
  "json-pointer",
  "relative-json-pointer",
]);

const fieldSchema = {
  type: "object",
  required: ["type"],
  additionalProperties: false,
  properties: {
    required: { type: "boolean" },
    type: { enum: ["string", "number", "boolean", "integer"] },
    aliases: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true,
    },
    format: { type: "string" },
    pattern: { type: "string" },
    enum: {
      type: "array",
      minItems: 1,
      items: {
        anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
      },
    },
    min: { type: "number" },
    max: { type: "number" },
  },
};

const rollupFieldSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    required: { type: "boolean" },
    type: { enum: ["string", "number", "boolean", "integer"] },
    format: { type: "string" },
    pattern: { type: "string" },
    enum: fieldSchema.properties.enum,
    min: { type: "number" },
    max: { type: "number" },
    fromLineField: { type: "string", minLength: 1 },
    aggregate: { enum: ["first", "firstNonEmpty", "sum", "count"] },
    value: {},
  },
};

const templateSchema = {
  type: "object",
  required: [
    "key",
    "label",
    "acceptedFileKinds",
    "sampleFileName",
    "lineFields",
    "orderRollup",
  ],
  additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    description: { type: "string" },
    templateVersion: { type: "integer", minimum: 1 },
    acceptedFileKinds: {
      type: "array",
      minItems: 1,
      items: { enum: ["csv", "tsv", "json", "excel"] },
      uniqueItems: true,
    },
    sampleFileName: { type: "string", minLength: 1 },
    preprocessing: {
      type: "object",
      additionalProperties: false,
      properties: {
        carryForwardSourceFields: {
          type: "array",
          items: { type: "string", minLength: 1 },
          uniqueItems: true,
        },
      },
    },
    lineFields: {
      type: "object",
      minProperties: 1,
      additionalProperties: fieldSchema,
    },
    transforms: {
      type: "object",
      additionalProperties: {
        anyOf: [
          { type: "string", enum: transformNames },
          {
            type: "object",
            required: ["type"],
            additionalProperties: false,
            properties: {
              type: { enum: transformNames },
              value: {},
              field: { type: "string" },
              map: {
                type: "object",
                additionalProperties: {},
              },
              default: {},
            },
          },
          {
            type: "array",
            minItems: 1,
            items: {
              anyOf: [
                { type: "string", enum: transformNames },
                {
                  type: "object",
                  required: ["type"],
                  additionalProperties: false,
                  properties: {
                    type: { enum: transformNames },
                    value: {},
                    field: { type: "string" },
                    map: {
                      type: "object",
                      additionalProperties: {},
                    },
                    default: {},
                  },
                },
              ],
            },
          },
        ],
      },
    },
    orderRollup: {
      type: "object",
      required: ["keyField", "fields"],
      additionalProperties: false,
      properties: {
        keyField: { type: "string", minLength: 1 },
        fields: {
          type: "object",
          minProperties: 1,
          additionalProperties: rollupFieldSchema,
        },
      },
    },
    settings: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowPartialSuccess: { type: "boolean" },
        maxErrors: { type: "integer", minimum: 1 },
        previewLimit: { type: "integer", minimum: 1 },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateTemplate = ajv.compile(templateSchema);

export function parseTemplatePayload(input: {
  format?: unknown;
  content?: unknown;
  template?: unknown;
}): { format: ConfigFormat; template: MarketplaceTemplate } {
  const format = normalizeFormat(input.format, input.content);
  let parsed: unknown;

  if (input.template !== undefined) {
    parsed = input.template;
  } else if (typeof input.content === "string") {
    try {
      parsed = format === "yaml" ? YAML.parse(input.content) : JSON.parse(input.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw badRequest(`Invalid ${format.toUpperCase()} template content`, message);
    }
  } else {
    throw badRequest("Either template object or content string is required");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("Template must be an object");
  }

  const template = structuredClone(parsed) as unknown as MarketplaceTemplate;
  assertValidTemplate(template);
  assertSupportedFieldRules(template);
  assertSupportedTransformShapes(template);

  return { format, template };
}

export function assertValidTemplate(template: unknown): asserts template is MarketplaceTemplate {
  if (!validateTemplate(template)) {
    throw badRequest(
      "Invalid marketplace template",
      validateTemplate.errors?.map((error) => ({
        path: error.instancePath || "/",
        message: error.message,
      })),
    );
  }

  const typed = template as unknown as MarketplaceTemplate;
  if (!(typed.orderRollup.keyField in typed.lineFields)) {
    throw badRequest(
      `orderRollup.keyField '${typed.orderRollup.keyField}' must exist in lineFields`,
    );
  }

  for (const [fieldName, field] of Object.entries(typed.orderRollup.fields)) {
    const usesLineField = typeof field.fromLineField === "string";
    const usesConstant = Object.prototype.hasOwnProperty.call(field, "value");
    const usesCount = field.aggregate === "count";

    if (!usesLineField && !usesConstant && !usesCount && fieldName !== "totalAmount") {
      throw badRequest(
        `orderRollup field '${fieldName}' must define fromLineField, value, or aggregate=count`,
      );
    }

    if (usesLineField && !(field.fromLineField as string in typed.lineFields)) {
      throw badRequest(
        `orderRollup field '${fieldName}' references unknown line field '${field.fromLineField}'`,
      );
    }
  }
}

function normalizeFormat(format: unknown, content: unknown): ConfigFormat {
  if (format === "yaml" || format === "json") {
    return format;
  }

  if (format !== undefined) {
    throw badRequest("format must be 'yaml' or 'json'");
  }

  if (typeof content === "string") {
    return content.trim().startsWith("{") ? "json" : "yaml";
  }

  return "json";
}

function assertSupportedFieldRules(template: MarketplaceTemplate): void {
  for (const [fieldName, field] of Object.entries(template.lineFields)) {
    assertSupportedFieldConfig(`lineFields.${fieldName}`, field);
  }

  for (const [fieldName, field] of Object.entries(template.orderRollup.fields)) {
    assertSupportedRollupFieldConfig(`orderRollup.fields.${fieldName}`, field);
  }
}

function assertSupportedFieldConfig(label: string, field: { format?: string; pattern?: string }): void {
  if (field.format && !supportedFieldFormats.has(field.format)) {
    throw badRequest(`${label} uses unsupported format '${field.format}'`);
  }

  if (field.pattern) {
    try {
      new RegExp(field.pattern);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw badRequest(`${label} has an invalid pattern`, message);
    }
  }
}

function assertSupportedRollupFieldConfig(label: string, field: RollupFieldConfig): void {
  assertSupportedFieldConfig(label, field);
}

function assertSupportedTransformShapes(template: MarketplaceTemplate): void {
  for (const [fieldName, raw] of Object.entries(template.transforms ?? {})) {
    for (const step of normalizeSteps(raw)) {
      const normalized = typeof step === "string" ? { type: step } : step;

      if (normalized.type === "source" && normalized.field && normalized.field.trim() === "") {
        throw badRequest(`Transform for '${fieldName}' has an empty source field`);
      }

      if (normalized.type === "enumMap" && normalized.map && typeof normalized.map !== "object") {
        throw badRequest(`Transform for '${fieldName}' must define a map object`);
      }
    }
  }
}

function normalizeSteps(steps: TransformStep | TransformStep[] | undefined): TransformStep[] {
  if (!steps) {
    return [];
  }

  return Array.isArray(steps) ? steps : [steps];
}
