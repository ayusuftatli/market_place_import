import { parse } from "csv-parse/browser/esm/sync";
import { read, utils, write } from "xlsx";
import { DEMO_JSON_RECORDS, DEMO_ORDER_HEADERS } from "./demoData";
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

  throw new Error("Use a CSV, JSON, XLS, or XLSX file.");
}

export async function prepareImportFile(
  file: File,
): Promise<PreparedImportSource> {
  const kind = detectImportFileKind(file.name, file.type);

  if (kind === "csv") {
    return createCsvSource(file.name, await file.text());
  }

  if (kind === "json") {
    return createJsonSource(file.name, parseJsonImport(await file.text()));
  }

  return createExcelSource(
    file.name,
    parseExcelRecords(await file.arrayBuffer()),
  );
}

export function createCsvSource(
  fileName: string,
  csvContent: string,
): PreparedImportSource {
  const records = parseCsvRecords(csvContent);

  return {
    kind: "csv",
    fileName,
    sourceType: "csv",
    recordCount: records.length,
    previewRows: records.slice(0, 5),
    csvContent,
  };
}

export function createJsonSource(
  fileName: string,
  records: SourceRecord[],
): PreparedImportSource {
  const asserted = assertSourceRecords(records, "JSON record");

  return {
    kind: "json",
    fileName,
    sourceType: "json",
    recordCount: asserted.length,
    previewRows: asserted.slice(0, 5),
    records: asserted,
  };
}

export function createExcelSource(
  fileName: string,
  records: SourceRecord[],
): PreparedImportSource {
  const asserted = assertSourceRecords(records, "Excel row");

  return {
    kind: "excel",
    fileName,
    sourceType: "json",
    recordCount: asserted.length,
    previewRows: asserted.slice(0, 5),
    records: asserted,
  };
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
  records: SourceRecord[] = DEMO_JSON_RECORDS,
): ArrayBuffer {
  const worksheet = utils.json_to_sheet(records, {
    header: DEMO_ORDER_HEADERS,
  });
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Orders");

  return write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;
}

export function createSampleExcelFile(): File {
  return new File([createSampleExcelWorkbook()], "urban-home-orders.xlsx", {
    type: EXCEL_MIME_TYPE,
  });
}

export function downloadSampleExcel(): void {
  const blob = new Blob([createSampleExcelWorkbook()], {
    type: EXCEL_MIME_TYPE,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "urban-home-orders.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}

function parseCsvRecords(content: string): SourceRecord[] {
  if (content.trim().length === 0) {
    throw new Error("CSV content must not be empty.");
  }

  const records = parse(content, {
    bom: true,
    columns: (headers: string[]) => headers.map((header) => header.trim()),
    skip_empty_lines: true,
    trim: false,
  }) as unknown;

  if (!Array.isArray(records)) {
    throw new Error("CSV content must parse to rows.");
  }

  return assertSourceRecords(records, "CSV row");
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
