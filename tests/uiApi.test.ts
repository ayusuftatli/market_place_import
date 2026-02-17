import { describe, expect, it } from "vitest";
import { buildImportRequest } from "../ui/src/api";
import { AMAZON_SAMPLE_TSV, GENERIC_SAMPLE_JSON } from "../ui/src/demoData";
import { createDelimitedSource, createRecordSource } from "../ui/src/importFiles";

describe("UI API request builders", () => {
  it("builds delimited import payloads for Amazon and Shopify-style files", () => {
    const payload = buildImportRequest({
      templateKey: "amazon",
      source: createDelimitedSource("orders.tsv", AMAZON_SAMPLE_TSV, "tsv"),
    });

    expect(payload).toEqual({
      templateKey: "amazon",
      inputKind: "delimited",
      fileName: "orders.tsv",
      content: AMAZON_SAMPLE_TSV,
    });
  });

  it("builds records payloads for browser-parsed JSON and Excel uploads", () => {
    const payload = buildImportRequest({
      templateKey: "generic",
      source: createRecordSource("orders.xlsx", GENERIC_SAMPLE_JSON, "excel"),
    });

    expect(payload).toEqual({
      templateKey: "generic",
      inputKind: "records",
      fileName: "orders.xlsx",
      records: GENERIC_SAMPLE_JSON,
    });
  });
});
