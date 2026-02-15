import { describe, expect, it } from "vitest";
import {
  parseCsvRecords,
  parseJsonRecords,
  parseSourceRecords
} from "../src/imports/sourceParsers";

describe("source parsers", () => {
  it("parses CSV records with headers", () => {
    const records = parseCsvRecords(" Order ID ,Total\n1001,84.50");

    expect(records).toEqual([{ "Order ID": "1001", Total: "84.50" }]);
  });

  it("parses CSV content through the source parser", () => {
    const records = parseSourceRecords({
      sourceType: "csv",
      content: "Order ID,Total\n1001,84.50"
    });

    expect(records).toEqual([{ "Order ID": "1001", Total: "84.50" }]);
  });

  it("parses JSON records", () => {
    const records = parseJsonRecords([{ id: "1001" }]);

    expect(records).toEqual([{ id: "1001" }]);
  });

  it("parses JSON records through the source parser", () => {
    const records = parseSourceRecords({
      sourceType: "json",
      records: [{ id: "1001" }]
    });

    expect(records).toEqual([{ id: "1001" }]);
  });

  it("rejects empty JSON input", () => {
    expect(() => parseJsonRecords([])).toThrow("at least one record");
  });

  it("rejects JSON input that is not an array of objects", () => {
    expect(() => parseJsonRecords({ id: "1001" })).toThrow(
      "records must be an array of objects"
    );
    expect(() => parseJsonRecords([{ id: "1001" }, null])).toThrow(
      "records[1] must be an object"
    );
  });

  it("rejects empty CSV input", () => {
    expect(() => parseCsvRecords("")).toThrow("non-empty string");
    expect(() => parseCsvRecords("Order ID,Total\n")).toThrow(
      "at least one data row"
    );
  });

  it("rejects blank CSV headers", () => {
    expect(() => parseCsvRecords("Order ID,\n1001,84.50")).toThrow(
      "CSV header at column 2 must not be empty"
    );
  });

  it("rejects malformed CSV input", () => {
    expect(() => parseCsvRecords('"unterminated')).toThrow("Malformed CSV");
  });

  it("rejects unsupported source types", () => {
    expect(() =>
      parseSourceRecords({ sourceType: "xml", records: [{ id: "1001" }] })
    ).toThrow("sourceType must be 'csv' or 'json'");
  });
});
