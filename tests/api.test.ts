import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { demoConfig, createTestContext, mixedCsv, validCsv } from "./helpers";
import { requestApp, requestRawApp } from "./httpTestClient";

async function createClient(app: ReturnType<typeof createTestContext>["app"]) {
  const response = await requestApp(app, "POST", "/clients", {
    code: "urban-home-store",
    name: "Urban Home Store"
  });

  return response.body as { id: string; code: string; name: string };
}

async function uploadConfig(
  app: ReturnType<typeof createTestContext>["app"],
  clientId: string,
  config = demoConfig()
) {
  const response = await requestApp(app, "POST", "/configs", {
    clientId,
    environment: config.environment,
    format: "json",
    config
  });

  return response.body as { id: string; version: number };
}

function usdOnlyCurrencyConfig() {
  const config = demoConfig();
  config.fields.currency.enum = ["USD"];
  return config;
}

describe("order import API", () => {
  it("returns health status", async () => {
    const { app } = createTestContext();

    const response = await requestApp(app, "GET", "/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns a client error for malformed JSON request bodies", async () => {
    const { app } = createTestContext();

    const response = await requestRawApp(
      app,
      "POST",
      "/imports/dry-run",
      '{"clientId":'
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/JSON|parse|Unexpected/i);
  });

  it("creates, rejects duplicate, lists, and validates clients", async () => {
    const { app } = createTestContext();

    const created = await requestApp(app, "POST", "/clients", {
      code: "urban-home-store",
      name: "Urban Home Store"
    });

    expect(created.status).toBe(201);
    expect(created.body.code).toBe("urban-home-store");
    expect(created.body.name).toBe("Urban Home Store");

    const detail = await requestApp(app, "GET", `/clients/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: created.body.id,
      code: "urban-home-store",
      name: "Urban Home Store"
    });

    const duplicate = await requestApp(app, "POST", "/clients", {
      code: "urban-home-store",
      name: "Urban Home Store"
    });
    expect(duplicate.status).toBe(409);

    const list = await requestApp(app, "GET", "/clients");
    expect(list.status).toBe(200);
    expect(list.body.clients).toHaveLength(1);

    const invalid = await requestApp(app, "GET", "/clients/not-an-id");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({
      error: {
        message: "Invalid id"
      }
    });

    const missing = await requestApp(
      app,
      "GET",
      `/clients/${new Types.ObjectId().toString()}`
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: {
        message: "Client not found"
      }
    });
  });

  it("uploads YAML and JSON configs, increments versions, filters, and promotes", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    const yaml = `
environment: development
source:
  type: csv
fields:
  externalOrderId:
    type: string
    required: true
    aliases: ["Order ID"]
`;

    const yamlConfig = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      format: "yaml",
      content: yaml
    });

    expect(yamlConfig.status).toBe(201);
    expect(yamlConfig.body.version).toBe(1);

    const jsonConfig = await uploadConfig(app, client.id);
    expect(jsonConfig.version).toBe(2);

    const list = await requestApp(
      app,
      "GET",
      `/configs?clientId=${client.id}&environment=development`
    );
    expect(list.status).toBe(200);
    expect(list.body.configs).toHaveLength(2);

    const promoted = await requestApp(
      app,
      "POST",
      `/configs/${jsonConfig.id}/promote`
    );
    expect(promoted.status).toBe(201);
    expect(promoted.body.environment).toBe("production");
    expect(promoted.body.promotedFromVersion).toBe(2);
  });

  it("runs a dry-run with valid CSV, stores a dry-run batch, and creates no orders", async () => {
    const { app, store } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(app, client.id);

    const result = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent: validCsv
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      configVersion: 1,
      totalRecords: 1,
      validRecords: 1,
      invalidRecords: 0,
      storedOrderCount: 0,
      errors: []
    });
    expect(result.body.normalizedPreview).toEqual([
      expect.objectContaining({
        externalOrderId: "1001",
        customerEmail: "sarah@example.com",
        customerName: "Sarah Miller",
        orderTotal: 84.5,
        currency: "EUR",
        orderDate: "2026-04-10",
        status: "paid"
      })
    ]);
    expect(result.body.normalizedPreview[0]).not.toHaveProperty("sourceRecord");

    const batch = await store.batches.findById(result.body.batchId);
    expect(batch).toMatchObject({
      clientId: client.id,
      mode: "dry-run",
      sourceType: "csv",
      totalRecords: 1,
      validRecords: 1,
      invalidRecords: 0,
      storedRecords: 0,
      errors: []
    });
    await expect(store.orders.count()).resolves.toBe(0);
  });

  it("runs a dry-run with mixed rows without storing normalized orders", async () => {
    const { app, store } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(app, client.id);

    const result = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent: mixedCsv
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      totalRecords: 2,
      validRecords: 1,
      invalidRecords: 1,
      storedOrderCount: 0,
      configVersion: 1
    });
    expect(result.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "customerEmail" }),
        expect.objectContaining({ row: 2, field: "orderTotal" })
      ])
    );
    expect(result.body.normalizedPreview[0]).toMatchObject({
      externalOrderId: "1001",
      customerEmail: "sarah@example.com",
      orderTotal: 84.5,
      currency: "EUR",
      status: "paid"
    });
    await expect(store.orders.count()).resolves.toBe(0);
  });

  it("uses an explicit config version for dry-runs when supplied", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(app, client.id);
    await uploadConfig(app, client.id, usdOnlyCurrencyConfig());

    const result = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.id,
      environment: "development",
      configVersion: 1,
      sourceType: "csv",
      csvContent: validCsv
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      configVersion: 1,
      totalRecords: 1,
      validRecords: 1,
      invalidRecords: 0,
      storedOrderCount: 0
    });
  });

  it("uses the latest config version for dry-runs by default", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(app, client.id);
    await uploadConfig(app, client.id, usdOnlyCurrencyConfig());

    const result = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent: validCsv
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      configVersion: 2,
      totalRecords: 1,
      validRecords: 0,
      invalidRecords: 1,
      storedOrderCount: 0
    });
    expect(result.body.errors).toEqual([
      expect.objectContaining({
        row: 1,
        field: "currency",
        value: "EUR"
      })
    ]);
  });

  it("commits valid rows and preserves source records when partial success is enabled", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(app, client.id);

    const result = await requestApp(app, "POST", "/imports", {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent: mixedCsv
    });

    expect(result.status).toBe(201);
    expect(result.body.storedOrderCount).toBe(1);

    const orders = await requestApp(app, "GET", `/orders?clientId=${client.id}`);
    expect(orders.status).toBe(200);
    expect(orders.body.orders).toHaveLength(1);
    expect(orders.body.orders[0].sourceRecord).toHaveProperty("Order ID", "1001");

    const batches = await requestApp(app, "GET", "/batches");
    expect(batches.status).toBe(200);
    expect(batches.body.batches[0]).toMatchObject({
      mode: "commit",
      storedRecords: 1
    });

    const orderDetail = await requestApp(
      app,
      "GET",
      `/orders/${orders.body.orders[0].id}`
    );
    expect(orderDetail.status).toBe(200);
    const batchDetail = await requestApp(app, "GET", `/batches/${result.body.batchId}`);
    expect(batchDetail.status).toBe(200);
  });

  it("does not commit any rows when partial success is disabled", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(
      app,
      client.id,
      demoConfig({
        settings: {
          allowPartialSuccess: false,
          maxErrors: 20,
          previewLimit: 10
        }
      })
    );

    const result = await requestApp(app, "POST", "/imports", {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent: mixedCsv
    });

    expect(result.status).toBe(201);
    expect(result.body.storedOrderCount).toBe(0);

    const orders = await requestApp(app, "GET", `/orders?clientId=${client.id}`);
    expect(orders.status).toBe(200);
    expect(orders.body.orders).toHaveLength(0);
  });

  it("commits fully valid JSON imports", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    await uploadConfig(
      app,
      client.id,
      demoConfig({ source: { type: "json", name: "json-order-export" } })
    );

    const result = await requestApp(app, "POST", "/imports", {
      clientId: client.id,
      environment: "development",
      records: [
        {
          order_id: "1001",
          email: "sarah@example.com",
          "Customer Name": "Sarah Miller",
          "Order Total": "84.50",
          Currency: "eur",
          "Order Date": "2026-04-10",
          Status: "complete"
        }
      ]
    });

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      totalRecords: 1,
      validRecords: 1,
      invalidRecords: 0,
      storedOrderCount: 1
    });
  });
});
