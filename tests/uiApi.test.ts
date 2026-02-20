import { afterEach, describe, expect, it, vi } from "vitest";
import { buildImportRequest, listOrders } from "../ui/src/api";
import { AMAZON_SAMPLE_TSV, GENERIC_SAMPLE_JSON } from "../ui/src/demoData";
import { createDelimitedSource, createRecordSource } from "../ui/src/importFiles";
import type { OrderExplorerQuery, OrderListResponse } from "../ui/src/types";

describe("UI API request builders", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("builds order list query strings with all explorer filters", async () => {
    const request = await captureListOrdersRequest({
      q: "customer 5001001",
      importRunId: "import run 1",
      salesChannel: "Shopify",
      orderStatus: "paid",
      paymentStatus: "captured",
      fulfillmentStatus: "fulfilled",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      minTotal: 12.5,
      maxTotal: "250.75",
      sort: "totalAmount:asc",
      page: 3,
      pageSize: "50",
    });

    expect(request.pathname).toBe("/orders");
    expect([...request.searchParams.entries()]).toEqual([
      ["q", "customer 5001001"],
      ["importRunId", "import run 1"],
      ["salesChannel", "Shopify"],
      ["orderStatus", "paid"],
      ["paymentStatus", "captured"],
      ["fulfillmentStatus", "fulfilled"],
      ["dateFrom", "2026-04-01"],
      ["dateTo", "2026-04-30"],
      ["minTotal", "12.5"],
      ["maxTotal", "250.75"],
      ["sort", "totalAmount:asc"],
      ["page", "3"],
      ["pageSize", "50"],
    ]);
  });

  it("omits empty order explorer filters", async () => {
    const request = await captureListOrdersRequest({
      q: " ",
      importRunId: "",
      salesChannel: "",
      orderStatus: "",
      paymentStatus: "",
      fulfillmentStatus: "",
      dateFrom: "",
      dateTo: "",
      minTotal: "",
      maxTotal: "",
      sort: "",
      page: "",
      pageSize: "",
    });

    expect(request.pathname).toBe("/orders");
    expect([...request.searchParams.entries()]).toEqual([]);
  });

  it("requests the default stored order list without a query string", async () => {
    const request = await captureListOrdersRequest();

    expect(request.pathname).toBe("/orders");
    expect(request.search).toBe("");
  });

  it("serializes order list sort and pagination predictably", async () => {
    const request = await captureListOrdersRequest({
      sort: "orderDate:desc",
      page: 2,
      pageSize: 100,
    });

    expect([...request.searchParams.entries()]).toEqual([
      ["sort", "orderDate:desc"],
      ["page", "2"],
      ["pageSize", "100"],
    ]);
  });
});

async function captureListOrdersRequest(
  query?: OrderExplorerQuery,
): Promise<URL> {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(emptyOrderListResponse()), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await listOrders(query);

  expect(fetchMock).toHaveBeenCalledOnce();
  return new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
}

function emptyOrderListResponse(): OrderListResponse {
  return {
    orders: [],
    total: 0,
    page: 1,
    pageSize: 25,
  };
}
