import { parse } from "csv-parse/browser/esm/sync";
import { read, utils, write } from "xlsx";
import { GENERIC_SAMPLE_JSON } from "./demoData";
import type {
  ImportFileKind,
  PreparedImportSource,
  SourceRecord,
} from "./types";

const EXCEL_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function detectImportFileKind(
  fileName: string,
  mimeType = "",
): ImportFileKind {
  const normalizedName = fileName.toLowerCase();
  const normalizedType = mimeType.toLowerCase();

  if (normalizedName.endsWith(".tsv") || normalizedType.includes("tab-separated")) {
    return "tsv";
  }

  if (normalizedName.endsWith(".csv") || normalizedType.includes("csv")) {
    return "csv";
  }

  if (normalizedName.endsWith(".json") || normalizedType.includes("json")) {
    return "json";
  }

  if (
    normalizedName.endsWith(".xlsx") ||
    normalizedName.endsWith(".xls") ||
    normalizedName.endsWith(".xlsm") ||
    normalizedType.includes("spreadsheet") ||
    normalizedType.includes("excel")
  ) {
    return "excel";
  }

  throw new Error("Use a CSV, TSV, JSON, XLS, or XLSX file.");
}

export async function prepareImportFile(
  file: File,
): Promise<PreparedImportSource> {
  const kind = detectImportFileKind(file.name, file.type);

  if (kind === "csv" || kind === "tsv") {
    return createDelimitedSource(file.name, await file.text(), kind);
  }

  if (kind === "json") {
    return createRecordSource(file.name, parseJsonImport(await file.text()), kind);
  }

  return createExcelSource(
    file.name,
    parseExcelRecords(await file.arrayBuffer()),
  );
}

export function createDelimitedSource(
  fileName: string,
  content: string,
  kind: "csv" | "tsv" = detectDelimiter(content, fileName) === "\t" ? "tsv" : "csv",
): PreparedImportSource {
  const records = parseDelimitedPreview(content, fileName);

  return {
    kind,
    inputKind: "delimited",
    fileName,
    recordCount: records.length,
    previewRows: records.slice(0, 5),
    content,
  };
}

export function createRecordSource(
  fileName: string,
  records: SourceRecord[],
  kind: "json" | "excel" = "json",
): PreparedImportSource {
  const asserted = assertSourceRecords(records, "Record");

  return {
    kind,
    inputKind: "records",
    fileName,
    recordCount: asserted.length,
    previewRows: asserted.slice(0, 5),
    records: asserted,
  };
}

export function createExcelSource(
  fileName: string,
  records: SourceRecord[],
): PreparedImportSource {
  return createRecordSource(fileName, records, "excel");
}

export function parseJsonImport(content: string): SourceRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed JSON: ${message}`);
  }

  if (Array.isArray(parsed)) {
    return assertSourceRecords(parsed, "JSON record");
  }

  if (isPlainObject(parsed) && Array.isArray(parsed.records)) {
    return assertSourceRecords(parsed.records, "JSON record");
  }

  throw new Error(
    "JSON import must be an array or an object with a records array.",
  );
}

export function parseExcelRecords(data: ArrayBuffer): SourceRecord[] {
  const workbook = read(data, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel workbook must include at least one worksheet.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const records = utils.sheet_to_json<SourceRecord>(worksheet, {
    defval: "",
    raw: false,
  });

  return assertSourceRecords(records, "Excel row");
}

export function createSampleExcelWorkbook(
  records: SourceRecord[] = GENERIC_SAMPLE_JSON,
): ArrayBuffer {
  const worksheet = utils.json_to_sheet(records);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Orders");

  return write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

export function downloadSampleExcel(fileName = "generic-marketplace-orders.xlsx"): void {
  const blob = new Blob([createSampleExcelWorkbook()], {
    type: EXCEL_MIME_TYPE,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseDelimitedPreview(
  content: string,
  fileName = "import.txt",
): SourceRecord[] {
  if (content.trim().length === 0) {
    throw new Error("Delimited content must not be empty.");
  }

  const delimiter = detectDelimiter(content, fileName);
  const records = parse(content, {
    bom: true,
    columns: (headers: string[]) => {
      const normalized = headers.map((header) => header.trim());
      const emptyHeaderIndex = normalized.findIndex((header) => header.length === 0);
      if (emptyHeaderIndex !== -1) {
        throw new Error(
          `Header at column ${emptyHeaderIndex + 1} must not be empty.`,
        );
      }
      return normalized;
    },
    delimiter,
    skip_empty_lines: true,
    trim: false,
    relax_column_count: true,
  }) as unknown;

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Delimited content must include at least one data row.");
  }

  return assertSourceRecords(records, "Row");
}

function detectDelimiter(content: string, fileName = ""): "," | "\t" | ";" {
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

function assertSourceRecords(
  records: unknown[],
  label: string,
): SourceRecord[] {
  if (records.length === 0) {
    throw new Error(`${label}s must include at least one row.`);
  }

  return records.map((record, index) => {
    if (!isPlainObject(record)) {
      throw new Error(`${label} ${index + 1} must be an object.`);
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
