import { parse } from "csv-parse/sync";
import { badRequest } from "../shared/errors";
import type { SourceType } from "../shared/types";

export type SourceRecord = Record<string, unknown>;

export function parseJsonRecords(records: unknown): SourceRecord[] {
  if (!Array.isArray(records)) {
    throw badRequest("records must be an array of objects");
  }

  if (records.length === 0) {
    throw badRequest("records must contain at least one record");
  }

  return records.map((record, index) => {
    if (!isPlainObject(record)) {
      throw badRequest(`records[${index}] must be an object`);
    }

    return record;
  });
}

export function parseCsvRecords(content: unknown): SourceRecord[] {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw badRequest("CSV content must be a non-empty string");
  }

  try {
    const records = parse(content, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      skip_empty_lines: true,
      trim: false
    }) as SourceRecord[];

    if (records.length === 0) {
      throw badRequest("CSV content must contain at least one data row");
    }

    return records;
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw badRequest("Malformed CSV content", message);
  }
}

export function parseSourceRecords(input: {
  sourceType: SourceType;
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

function isPlainObject(value: unknown): value is SourceRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
