import { describe, expect, it } from "vitest";
import { DEMO_CSV } from "../ui/src/demoData";
import {
  createCsvSource,
  createExcelSource,
  createJsonSource,
  createSampleExcelWorkbook,
  detectImportFileKind,
  parseExcelRecords,
  parseJsonImport,
} from "../ui/src/importFiles";

describe("UI import file helpers", () => {
  it("detects supported import file kinds", () => {
    expect(detectImportFileKind("orders.csv")).toBe("csv");
    expect(detectImportFileKind("orders.json")).toBe("json");
    expect(detectImportFileKind("orders.xlsx")).toBe("excel");
    expect(detectImportFileKind("orders.xls")).toBe("excel");
    expect(() => detectImportFileKind("orders.txt")).toThrow(
      "Use a CSV, JSON, XLS, or XLSX file.",
    );
  });

  it("creates CSV import sources that preserve csvContent", () => {
    const source = createCsvSource("orders.csv", DEMO_CSV);

    expect(source).toMatchObject({
      kind: "csv",
      sourceType: "csv",
      fileName: "orders.csv",
      recordCount: 2,
      csvContent: DEMO_CSV,
    });
    expect(source.previewRows[0]).toMatchObject({
      "Order ID": "1001",
      "Customer Email": "sarah@example.com",
    });
  });

  it("accepts JSON arrays and records wrappers", () => {
    const arrayRecords = parseJsonImport('[{"id":"1001"}]');
    const wrapperRecords = parseJsonImport('{"records":[{"id":"1002"}]}');

    expect(createJsonSource("orders.json", arrayRecords)).toMatchObject({
      kind: "json",
      sourceType: "json",
      recordCount: 1,
    });
    expect(wrapperRecords).toEqual([{ id: "1002" }]);
  });

  it("parses the first Excel worksheet into JSON records", () => {
    const workbook = createSampleExcelWorkbook([
      {
        order_id: "1001",
        email: "sarah@example.com",
        "Customer Name": "Sarah Miller",
        "Order Total": "84.50",
        Currency: "eur",
        "Order Date": "2026-04-10",
        Status: "complete",
      },
    ]);
    const records = parseExcelRecords(workbook);
    const source = createExcelSource("orders.xlsx", records);

    expect(source).toMatchObject({
      kind: "excel",
      sourceType: "json",
      recordCount: 1,
    });
    expect(source.records?.[0]).toMatchObject({
      order_id: "1001",
      email: "sarah@example.com",
      "Customer Name": "Sarah Miller",
    });
  });
});
