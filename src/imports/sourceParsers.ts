import { parse } from "csv-parse/sync";
import { badRequest } from "../shared/errors";

export type SourceRecord = Record<string, unknown>;

export function parseJsonRecords(records: unknown): SourceRecord[] {
  if (!Array.isArray(records)) {
    throw badRequest("records must be an array of objects");
  }

  if (records.length === 0) {
    throw badRequest("records must contain at least one record");
  }

  return assertSourceRecords(records, "records");
}

export function parseCsvRecords(content: unknown): SourceRecord[] {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw badRequest("CSV content must be a non-empty string");
  }

  try {
    const records = parse(content, {
      bom: true,
      columns: normalizeCsvHeaders,
      skip_empty_lines: true,
      trim: false
    }) as unknown;

    if (!Array.isArray(records)) {
      throw badRequest("CSV content must parse to an array of objects");
    }

    if (records.length === 0) {
      throw badRequest("CSV content must contain at least one data row");
    }

    return assertSourceRecords(records, "CSV row");
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw badRequest("Malformed CSV content", message);
  }
}

export function parseSourceRecords(input: {
  sourceType: unknown;
  records?: unknown;
  content?: unknown;
  csvContent?: unknown;
}): SourceRecord[] {
  if (input.sourceType === "json") {
    return parseJsonRecords(input.records);
  }

  if (input.sourceType === "csv") {
    return parseCsvRecords(input.csvContent ?? input.content);
  }

  throw badRequest("sourceType must be 'csv' or 'json'");
}

function normalizeCsvHeaders(headers: string[]): string[] {
  const normalized = headers.map((header) => header.trim());
  const emptyHeaderIndex = normalized.findIndex((header) => header.length === 0);

  if (emptyHeaderIndex !== -1) {
    throw badRequest(
      `CSV header at column ${emptyHeaderIndex + 1} must not be empty`
    );
  }

  return normalized;
}

function assertSourceRecords(records: unknown[], label: string): SourceRecord[] {
  return records.map((record, index) => {
    if (!isPlainObject(record)) {
      throw badRequest(`${label}[${index}] must be an object`);
    }

    return record;
  });
}

function isPlainObject(value: unknown): value is SourceRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
