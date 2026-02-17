import { describe, expect, it } from "vitest";
import {
  applyTemplatePreprocessing,
  detectDelimiter,
  parseDelimitedContent,
  parseJsonRecords,
  parseSourceInput,
} from "../src/imports/sourceParsers";
import { getBuiltInTemplate } from "../src/templates/builtInTemplates";
import { shopifyCsv } from "./helpers";

describe("source parsers", () => {
  it("detects TSV and CSV delimiters", () => {
    expect(detectDelimiter("a\tb\n1\t2", "orders.tsv")).toBe("\t");
    expect(detectDelimiter("a,b\n1,2", "orders.csv")).toBe(",");
  });

  it("parses TSV and reports the source kind", () => {
    const parsed = parseDelimitedContent("a\tb\n1\t2", "orders.tsv");

    expect(parsed.sourceKind).toBe("tsv");
    expect(parsed.records).toEqual([{ a: "1", b: "2" }]);
  });

  it("parses records input through the unified source parser", () => {
    const parsed = parseSourceInput({
      inputKind: "records",
      fileName: "orders.json",
      records: [{ id: "1001" }],
    });

    expect(parsed.sourceKind).toBe("json");
    expect(parsed.records).toEqual([{ id: "1001" }]);
  });

  it("carries Shopify order-level values across repeated line rows", () => {
    const template = getBuiltInTemplate("shopify");
    if (!template) {
      throw new Error("Expected built-in Shopify template");
    }

    const parsed = parseDelimitedContent(shopifyCsv, "shopify.csv");
    const records = applyTemplatePreprocessing(parsed.records, template);

    expect(records[1]).toMatchObject({
      Id: "5001001",
      Name: "#1001",
      Email: "olivia@example.com",
      Currency: "EUR",
      "Shipping Country": "DE",
    });
  });

  it("rejects empty and malformed JSON record payloads", () => {
    expect(() => parseJsonRecords([])).toThrow("at least one record");
    expect(() => parseJsonRecords([{ id: "1001" }, null])).toThrow(
      "records[1] must be an object",
    );
  });

  it("rejects malformed delimited content", () => {
    expect(() => parseDelimitedContent('"unterminated', "orders.csv")).toThrow(
      "Malformed delimited content",
    );
  });
});
