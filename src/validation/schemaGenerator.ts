import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { FieldConfig, RowValidationError } from "../shared/types";

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);

export interface ValidateRecordOptions {
  maxErrors?: number;
}

export interface RecordValidationResult {
  valid: boolean;
  errors: RowValidationError[];
}

export type RecordValidator = (
  record: Record<string, unknown>,
  row: number,
  options?: ValidateRecordOptions,
) => RecordValidationResult;

export function generateJsonSchema(
  fields: Record<string, FieldConfig>,
): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [fieldName, fieldConfig] of Object.entries(fields)) {
    const property: Record<string, unknown> = {
      type: fieldConfig.type,
    };

    if (fieldConfig.format) {
      property.format = fieldConfig.format;
    }
    if (fieldConfig.pattern) {
      property.pattern = fieldConfig.pattern;
    }
    if (fieldConfig.enum) {
      property.enum = fieldConfig.enum;
    }
    if (fieldConfig.min !== undefined) {
      property.minimum = fieldConfig.min;
    }
    if (fieldConfig.max !== undefined) {
      property.maximum = fieldConfig.max;
    }
    if (fieldConfig.required) {
      required.push(fieldName);
    }

    properties[fieldName] = property;
  }

  return {
    type: "object",
    additionalProperties: true,
    properties,
    required,
  };
}

export function createRecordValidator(
  fields: Record<string, FieldConfig>,
): RecordValidator {
  const validate = ajv.compile(generateJsonSchema(fields));

  return (record, row, options = {}) => {
    const valid = validate(record);
    if (valid) {
      return {
        valid: true,
        errors: [],
      };
    }

    const maxErrors = normalizeMaxErrors(options.maxErrors);

    return {
      valid: false,
      errors: (validate.errors ?? [])
        .slice(0, maxErrors)
        .map((error) => toRowValidationError(error, record, row)),
    };
  };
}

function toRowValidationError(
  error: ErrorObject,
  record: Record<string, unknown>,
  row: number,
): RowValidationError {
  const field =
    error.keyword === "required"
      ? String((error.params as { missingProperty: string }).missingProperty)
      : error.instancePath.replace(/^\//, "").split("/")[0] || undefined;

  const value = field ? record[field] : undefined;

  return {
    row,
    field,
    message: formatMessage(error, field),
    value,
  };
}

function formatMessage(error: ErrorObject, field?: string): string {
  const label = field ?? "record";

  switch (error.keyword) {
    case "required":
      return `${label} is required`;
    case "format":
      return `${label} must match format '${String(error.params.format)}'`;
    case "minimum":
      return `${label} must be >= ${String(error.params.limit)}`;
    case "maximum":
      return `${label} must be <= ${String(error.params.limit)}`;
    case "enum":
      return `${label} must be one of the allowed values`;
    case "type":
      return `${label} must be ${String(error.params.type)}`;
    case "pattern":
      return `${label} must match the configured pattern`;
    default:
      return `${label} ${error.message ?? "is invalid"}`;
  }
}

function normalizeMaxErrors(value: number | undefined): number {
  if (value === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor(value));
}
