import { parse } from "csv-parse/sync";
import { badRequest } from "../shared/errors";
import type { InputKind, MarketplaceTemplate, ParsedSourceInput, SourceKind } from "../shared/types";
import type { SourceRecord } from "../transformation/transformer";
import { isMissing } from "../transformation/transformer";

export function parseSourceInput(input: {
  inputKind: unknown;
  fileName: unknown;
  content?: unknown;
  records?: unknown;
}): ParsedSourceInput {
  const inputKind = normalizeInputKind(input.inputKind);
  const fileName = normalizeFileName(input.fileName);

  if (inputKind === "records") {
    return {
      sourceKind: "json",
      records: parseJsonRecords(input.records),
    };
  }

  return parseDelimitedContent(input.content, fileName);
}

export function parseJsonRecords(records: unknown): SourceRecord[] {
  if (!Array.isArray(records)) {
    throw badRequest("records must be an array of objects");
  }

  if (records.length === 0) {
    throw badRequest("records must contain at least one record");
  }

  return assertSourceRecords(records, "records");
}

export function parseDelimitedContent(
  content: unknown,
  fileName = "import.txt",
): ParsedSourceInput {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw badRequest("content must be a non-empty string");
  }

  try {
    const delimiter = detectDelimiter(content, fileName);
    const records = parse(content, {
      bom: true,
      columns: normalizeHeaders,
      delimiter,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true,
    }) as unknown;

    if (!Array.isArray(records) || records.length === 0) {
      throw badRequest("Delimited content must contain at least one data row");
    }

    return {
      sourceKind: delimiter === "\t" ? "tsv" : "csv",
      records: assertSourceRecords(records, "row"),
    };
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw badRequest("Malformed delimited content", message);
  }
}

export function detectDelimiter(content: string, fileName = ""): "," | "\t" | ";" {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".tsv")) {
    return "\t";
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);

  const counts = {
    ",": 0,
    "\t": 0,
    ";": 0,
  };

  for (const line of lines) {
    counts[","] += countOccurrences(line, ",");
    counts["\t"] += countOccurrences(line, "\t");
    counts[";"] += countOccurrences(line, ";");
  }

  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) {
    return "\t";
  }

  if (counts[";"] > counts[","]) {
    return ";";
  }

  return ",";
}

export function applyTemplatePreprocessing(
  records: SourceRecord[],
  template: MarketplaceTemplate,
): SourceRecord[] {
  const carryForwardFields = template.preprocessing?.carryForwardSourceFields ?? [];
  if (carryForwardFields.length === 0) {
    return records.map((record) => ({ ...record }));
  }

  const previousValues = new Map<string, unknown>();

  return records.map((record) => {
    const next: SourceRecord = { ...record };

    for (const field of carryForwardFields) {
      const value = next[field];
      if (isMissing(value)) {
        if (previousValues.has(field)) {
          next[field] = previousValues.get(field);
        }
      } else {
        previousValues.set(field, value);
      }
    }

    return next;
  });
}

function normalizeInputKind(value: unknown): InputKind {
  if (value === "delimited" || value === "records") {
    return value;
  }

  throw badRequest("inputKind must be 'delimited' or 'records'");
}

function normalizeFileName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest("fileName is required");
  }

  return value.trim();
}

function normalizeHeaders(headers: string[]): string[] {
  const normalized = headers.map((header) => header.trim());
  const emptyHeaderIndex = normalized.findIndex((header) => header.length === 0);

  if (emptyHeaderIndex !== -1) {
    throw badRequest(
      `Delimited header at column ${emptyHeaderIndex + 1} must not be empty`,
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

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
