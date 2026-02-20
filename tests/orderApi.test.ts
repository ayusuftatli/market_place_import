import type { Express } from "express";
import { describe, expect, it } from "vitest";
import {
  amazonTsv,
  createTestContext,
  genericCsv,
  genericJson,
  shopifyCsv,
} from "./helpers";
import { requestApp, type TestResponse } from "./httpTestClient";

interface OrderSummaryBody {
  id: string;
  importRunId: string;
  sourceOrderId: string;
  salesChannel: string;
  orderDate: string;
  orderStatus: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  totalAmount: number;
  customerName?: string;
  shipCity?: string;
  shipCountry?: string;
  createdAt: string;
}

interface OrdersResponseBody {
  orders: OrderSummaryBody[];
  total: number;
  page: number;
  pageSize: number;
}

describe("stored order API", () => {
  it("returns default paginated response metadata", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    const response = await requestApp(app, "GET", "/orders");
    const body = ordersBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      total: 8,
      page: 1,
      pageSize: 25,
    });
    expect(body.orders).toHaveLength(8);
  });

  it("searches order id, customer, city, and country fields", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    await expectOrderIds(app, "/orders?q=GEN-9001", ["GEN-9001"]);
    await expectOrderIds(app, "/orders?q=Olivia", ["5001001"]);
    await expectOrderIds(app, "/orders?q=Austin", ["GEN-9002"]);
    await expectOrderIds(app, "/orders?q=GB&sort=orderDate:asc", [
      "GEN-9101",
      "GEN-9102",
    ]);
  });

  it("filters by import run, channel, and statuses", async () => {
    const { app } = createTestContext();
    const seed = await seedStoredOrders(app);

    await expectOrderIds(
      app,
      `/orders?importRunId=${encodeURIComponent(seed.genericImportRunId)}&sort=orderDate:asc`,
      ["GEN-9001", "GEN-9002"],
    );
    await expectOrderIds(app, "/orders?salesChannel=Wholesale%20Portal", [
      "GEN-9001",
    ]);
    await expectOrderIds(app, "/orders?orderStatus=pending", ["GEN-9002"]);
    await expectOrderIds(
      app,
      "/orders?paymentStatus=authorized&sort=orderDate:asc",
      ["5001002", "GEN-9002"],
    );
    await expectOrderIds(app, "/orders?fulfillmentStatus=unfulfilled", [
      "5001002",
    ]);
  });

  it("filters by order date range", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    await expectOrderIds(
      app,
      "/orders?dateFrom=2026-04-13&dateTo=2026-04-15&sort=orderDate:asc",
      ["5001002", "GEN-9001", "GEN-9002"],
    );
  });

  it("filters by total amount range", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    await expectOrderIds(
      app,
      "/orders?minTotal=130&maxTotal=150&sort=totalAmount:asc",
      ["5001001"],
    );
  });

  it("supports all stored order sort values", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    const createdAtAsc = await listOrders(
      app,
      "/orders?sort=createdAt:asc&pageSize=100",
    );
    const createdAtDesc = await listOrders(
      app,
      "/orders?sort=createdAt:desc&pageSize=100",
    );
    expect(ids(createdAtDesc.orders)).toEqual(
      [...ids(createdAtAsc.orders)].reverse(),
    );

    const orderDateAsc = await listOrders(
      app,
      "/orders?sort=orderDate:asc&pageSize=100",
    );
    const orderDateDesc = await listOrders(
      app,
      "/orders?sort=orderDate:desc&pageSize=100",
    );
    expect(orderDateAsc.orders.map((order) => order.orderDate)).toEqual(
      [...orderDateAsc.orders.map((order) => order.orderDate)].sort(),
    );
    expect(orderDateDesc.orders.map((order) => order.orderDate)).toEqual(
      [...orderDateDesc.orders.map((order) => order.orderDate)]
        .sort()
        .reverse(),
    );

    const totalAsc = await listOrders(
      app,
      "/orders?sort=totalAmount:asc&pageSize=100",
    );
    const totalDesc = await listOrders(
      app,
      "/orders?sort=totalAmount:desc&pageSize=100",
    );
    expect(totalAsc.orders.map((order) => order.totalAmount)).toEqual(
      [...totalAsc.orders.map((order) => order.totalAmount)].sort(
        (left, right) => left - right,
      ),
    );
    expect(totalDesc.orders.map((order) => order.totalAmount)).toEqual(
      [...totalDesc.orders.map((order) => order.totalAmount)].sort(
        (left, right) => right - left,
      ),
    );
  });

  it("paginates results and caps page size at 100", async () => {
    const { app } = createTestContext();
    await seedStoredOrders(app);

    const pageTwo = await listOrders(
      app,
      "/orders?sort=orderDate:asc&page=2&pageSize=3",
    );
    expect(pageTwo).toMatchObject({
      total: 8,
      page: 2,
      pageSize: 3,
    });
    expect(ids(pageTwo.orders)).toEqual(["5001002", "GEN-9001", "GEN-9002"]);

    const capped = await listOrders(app, "/orders?pageSize=500");
    expect(capped.pageSize).toBe(100);
    expect(capped.orders).toHaveLength(8);
  });

  it.each([
    "/orders?sort=sourceOrderId:asc",
    "/orders?dateFrom=2026-02-30",
    "/orders?dateTo=04%2F20%2F2026",
    "/orders?minTotal=abc",
    "/orders?maxTotal=Infinity",
    "/orders?page=0",
    "/orders?page=1.5",
    "/orders?pageSize=0",
    "/orders?pageSize=2.5",
  ])("returns 400 for invalid query value %s", async (path) => {
    const { app } = createTestContext();

    const response = await requestApp(app, "GET", path);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        message: expect.any(String),
      },
    });
  });
});

async function seedStoredOrders(app: Express): Promise<{
  genericImportRunId: string;
}> {
  const genericImportRunId = await commitImport(app, {
    templateKey: "generic",
    inputKind: "delimited",
    fileName: "generic-marketplace-orders.csv",
    content: genericCsv,
  });
  await commitImport(app, {
    templateKey: "shopify",
    inputKind: "delimited",
    fileName: "shopify-orders-export.csv",
    content: shopifyCsv,
  });
  await commitImport(app, {
    templateKey: "amazon",
    inputKind: "delimited",
    fileName: "amazon-orders-report.tsv",
    content: amazonTsv,
  });
  await commitImport(app, {
    templateKey: "generic",
    inputKind: "records",
    fileName: "generic-marketplace-orders.json",
    records: genericJson,
  });

  return { genericImportRunId };
}

async function commitImport(
  app: Express,
  payload: Record<string, unknown>,
): Promise<string> {
  const response = await requestApp(app, "POST", "/imports", payload);
  expect(response.status).toBe(201);

  return (response.body as { importRunId: string }).importRunId;
}

async function expectOrderIds(
  app: Express,
  path: string,
  expectedIds: string[],
): Promise<void> {
  const body = await listOrders(app, path);
  expect(ids(body.orders)).toEqual(expectedIds);
  expect(body.total).toBe(expectedIds.length);
}

async function listOrders(
  app: Express,
  path: string,
): Promise<OrdersResponseBody> {
  const response = await requestApp(app, "GET", path);
  expect(response.status).toBe(200);
  return ordersBody(response);
}

function ordersBody(response: TestResponse): OrdersResponseBody {
  return response.body as OrdersResponseBody;
}

function ids(orders: OrderSummaryBody[]): string[] {
  return orders.map((order) => order.sourceOrderId);
}
