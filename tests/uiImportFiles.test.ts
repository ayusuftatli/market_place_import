import { describe, expect, it } from "vitest";
import { AMAZON_SAMPLE_TSV, GENERIC_SAMPLE_JSON } from "../ui/src/demoData";
import {
  createDelimitedSource,
  createExcelSource,
  createRecordSource,
  createSampleExcelWorkbook,
  detectImportFileKind,
  parseExcelRecords,
  parseJsonImport,
} from "../ui/src/importFiles";

describe("UI import file helpers", () => {
  it("detects supported import file kinds", () => {
    expect(detectImportFileKind("orders.tsv")).toBe("tsv");
    expect(detectImportFileKind("orders.csv")).toBe("csv");
    expect(detectImportFileKind("orders.json")).toBe("json");
    expect(detectImportFileKind("orders.xlsx")).toBe("excel");
    expect(() => detectImportFileKind("orders.txt")).toThrow(
      "Use a CSV, TSV, JSON, XLS, or XLSX file.",
    );
  });

  it("creates delimited sources that preserve content", () => {
    const source = createDelimitedSource("orders.tsv", AMAZON_SAMPLE_TSV, "tsv");

    expect(source).toMatchObject({
      kind: "tsv",
      inputKind: "delimited",
      fileName: "orders.tsv",
      recordCount: 3,
      content: AMAZON_SAMPLE_TSV,
    });
  });

  it("accepts JSON arrays and records wrappers", () => {
    const arrayRecords = parseJsonImport('[{"id":"1001"}]');
    const wrapperRecords = parseJsonImport('{"records":[{"id":"1002"}]}');

    expect(createRecordSource("orders.json", arrayRecords, "json")).toMatchObject({
      kind: "json",
      inputKind: "records",
      recordCount: 1,
    });
    expect(wrapperRecords).toEqual([{ id: "1002" }]);
  });

  it("parses the first Excel worksheet into record rows", () => {
    const workbook = createSampleExcelWorkbook(GENERIC_SAMPLE_JSON);
    const records = parseExcelRecords(workbook);
    const source = createExcelSource("orders.xlsx", records);

    expect(source).toMatchObject({
      kind: "excel",
      inputKind: "records",
      recordCount: GENERIC_SAMPLE_JSON.length,
    });
    expect(source.records?.[0]).toMatchObject({
      "Marketplace Order ID": "GEN-9101",
    });
  });
});
