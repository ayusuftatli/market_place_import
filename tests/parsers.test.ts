import { describe, expect, it } from "vitest";
import { parseCsvRecords, parseJsonRecords } from "../src/imports/sourceParsers";

describe("source parsers", () => {
  it("parses CSV records with headers", () => {
    const records = parseCsvRecords("Order ID,Total\n1001,84.50");

    expect(records).toEqual([{ "Order ID": "1001", Total: "84.50" }]);
  });

  it("parses JSON records", () => {
    const records = parseJsonRecords([{ id: "1001" }]);

    expect(records).toEqual([{ id: "1001" }]);
  });

  it("rejects empty JSON input", () => {
    expect(() => parseJsonRecords([])).toThrow("at least one record");
  });

  it("rejects malformed CSV input", () => {
    expect(() => parseCsvRecords('"unterminated')).toThrow("Malformed CSV");
  });
});
