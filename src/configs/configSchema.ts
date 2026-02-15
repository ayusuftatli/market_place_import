import Ajv from "ajv";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { badRequest } from "../shared/errors";
import type {
  ConfigFormat,
  Environment,
  ImportTemplate,
  TransformStep
} from "../shared/types";

const transformNames = [
  "uppercase",
  "lowercase",
  "trim",
  "default",
  "source",
  "enumMap",
  "numberCoerce",
  "dateNormalize"
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
  "relative-json-pointer"
]);

const configSchema = {
  type: "object",
  required: ["environment", "source", "fields"],
  additionalProperties: false,
  properties: {
    client: { type: "string" },
    environment: { enum: ["development", "production"] },
    version: { type: "integer", minimum: 1 },
    source: {
      type: "object",
      required: ["type"],
      additionalProperties: false,
      properties: {
        type: { enum: ["csv", "json"] },
        name: { type: "string" }
      }
    },
    fields: {
      type: "object",
      minProperties: 1,
      additionalProperties: {
        type: "object",
        required: ["type"],
        additionalProperties: false,
        properties: {
          required: { type: "boolean" },
          type: { enum: ["string", "number", "boolean", "integer"] },
          aliases: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true
          },
          format: { type: "string" },
          pattern: { type: "string" },
          enum: {
            type: "array",
            minItems: 1,
            items: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }]
            }
          },
          min: { type: "number" },
          max: { type: "number" }
        }
      }
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
                additionalProperties: {}
              },
              default: {}
            }
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
                      additionalProperties: {}
                    },
                    default: {}
                  }
                }
              ]
            }
          }
        ]
      }
    },
    settings: {
      type: "object",
      additionalProperties: false,
      properties: {
        allowPartialSuccess: { type: "boolean" },
        maxErrors: { type: "integer", minimum: 1 },
        previewLimit: { type: "integer", minimum: 1 }
      }
    }
  }
};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateConfig = ajv.compile(configSchema);

export function parseConfigPayload(input: {
  format?: unknown;
  content?: unknown;
  config?: unknown;
  environment?: unknown;
}): { format: ConfigFormat; config: ImportTemplate } {
  const format = normalizeFormat(input.format, input.content);
  let parsed: unknown;

  if (input.config !== undefined) {
    parsed = input.config;
  } else if (typeof input.content === "string") {
    try {
      parsed = format === "yaml" ? YAML.parse(input.content) : JSON.parse(input.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw badRequest(`Invalid ${format.toUpperCase()} config content`, message);
    }
  } else {
    throw badRequest("Either config object or content string is required");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("Config must be an object");
  }

  const config = structuredClone(parsed) as ImportTemplate;
  if (!config.environment && input.environment) {
    config.environment = normalizeEnvironment(input.environment);
  }

  assertValidImportTemplate(config);
  assertSupportedFieldRules(config);
  assertSupportedTransformShapes(config);

  return { format, config };
}

export function assertValidImportTemplate(config: unknown): asserts config is ImportTemplate {
  if (!validateConfig(config)) {
    throw badRequest(
      "Invalid import config",
      validateConfig.errors?.map((error) => ({
        path: error.instancePath || "/",
        message: error.message
      }))
    );
  }
}

export function normalizeEnvironment(value: unknown): Environment {
  if (value === "development" || value === "production") {
    return value;
  }

  throw badRequest("environment must be 'development' or 'production'");
}

function normalizeFormat(format: unknown, content: unknown): ConfigFormat {
  if (format === "yaml" || format === "json") {
    return format;
  }

  if (format !== undefined) {
    throw badRequest("format must be 'yaml' or 'json'");
  }

  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.startsWith("{") ? "json" : "yaml";
  }

  return "json";
}

function assertSupportedFieldRules(config: ImportTemplate): void {
  for (const [fieldName, field] of Object.entries(config.fields)) {
    if (field.format && !supportedFieldFormats.has(field.format)) {
      throw badRequest(
        `Field '${fieldName}' uses unsupported format '${field.format}'`
      );
    }

    if (field.pattern) {
      try {
        new RegExp(field.pattern);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw badRequest(`Field '${fieldName}' has an invalid pattern`, message);
      }
    }

    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      throw badRequest(`Field '${fieldName}' min cannot be greater than max`);
    }
  }
}

function assertSupportedTransformShapes(config: ImportTemplate): void {
  const transforms = config.transforms;
  if (!transforms) {
    return;
  }

  for (const [field, rawSteps] of Object.entries(transforms)) {
    if (!config.fields[field]) {
      throw badRequest(`Transform '${field}' does not match a configured field`);
    }

    const steps = Array.isArray(rawSteps) ? rawSteps : [rawSteps];
    for (const step of steps) {
      const normalized = normalizeTransformStep(step);
      if (normalized.type === "source" && !normalized.field) {
        throw badRequest(`Transform '${field}.source' requires a field`);
      }

      if (normalized.type === "enumMap" && !normalized.map) {
        throw badRequest(`Transform '${field}.enumMap' requires a map`);
      }
    }
  }
}

function normalizeTransformStep(step: TransformStep): {
  type: string;
  field?: string;
  map?: Record<string, unknown>;
} {
  return typeof step === "string" ? { type: step } : step;
}
