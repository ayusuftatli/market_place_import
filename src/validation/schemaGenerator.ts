import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { ImportTemplate, RowValidationError } from "../shared/types";

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);
const defaultMaxErrors = 50;

export interface ValidateRecordOptions {
  maxErrors?: number;
}

export interface NormalizedRecordValidationResult {
  valid: boolean;
  errors: RowValidationError[];
}

export interface NormalizedRecordsValidationSummary {
  validRecords: number;
  invalidRecords: number;
  errors: RowValidationError[];
}

export type NormalizedRecordValidator = (
  record: Record<string, unknown>,
  row: number,
  options?: ValidateRecordOptions
) => NormalizedRecordValidationResult;

export function generateJsonSchema(config: ImportTemplate): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
    const property: Record<string, unknown> = {
      type: fieldConfig.type
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
    required
  };
}

export function validateNormalizedRecord(
  config: ImportTemplate,
  record: Record<string, unknown>,
  row: number,
  options: ValidateRecordOptions = {}
): RowValidationError[] {
  return createNormalizedRecordValidator(config)(record, row, options).errors;
}

export function createNormalizedRecordValidator(
  config: ImportTemplate
): NormalizedRecordValidator {
  const validate = ajv.compile(generateJsonSchema(config));

  return (record, row, options = {}) => {
    const valid = validate(record);
    if (valid) {
      return {
        valid: true,
        errors: []
      };
    }

    const maxErrors = normalizeMaxErrors(options.maxErrors);

    return {
      valid: false,
      errors: (validate.errors ?? [])
        .slice(0, maxErrors)
        .map((error) => toRowValidationError(error, record, row))
    };
  };
}

export function validateNormalizedRecords(
  config: ImportTemplate,
  records: Array<Record<string, unknown>>
): NormalizedRecordsValidationSummary {
  const validateRecord = createNormalizedRecordValidator(config);
  const maxErrors = config.settings?.maxErrors ?? defaultMaxErrors;
  const errors: RowValidationError[] = [];
  let validRecords = 0;
  let invalidRecords = 0;

  records.forEach((record, index) => {
    const validation = validateRecord(record, index + 1, {
      maxErrors: Math.max(maxErrors - errors.length, 0)
    });

    if (validation.valid) {
      validRecords += 1;
      return;
    }

    invalidRecords += 1;
    errors.push(...validation.errors);
  });

  return {
    validRecords,
    invalidRecords,
    errors
  };
}

function toRowValidationError(
  error: ErrorObject,
  record: Record<string, unknown>,
  row: number
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
    value
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
