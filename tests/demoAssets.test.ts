import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTestContext } from "./helpers";
import { requestApp } from "./httpTestClient";

interface PostmanCollection {
  variable: Array<{ key: string; value: string }>;
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    url: string;
    body?: {
      raw: string;
    };
  };
}

describe("demo assets", () => {
  it("runs the README demo flow with the checked-in YAML and CSV data", async () => {
    const { app, store } = createTestContext();
    const configContent = readFileSync(
      "examples/configs/urban-home-orders.yaml",
      "utf8"
    );
    const csvContent = readFileSync("examples/data/orders.csv", "utf8");

    const client = await requestApp(app, "POST", "/clients", {
      code: "urban-home-store",
      name: "Urban Home Store"
    });
    expect(client.status).toBe(201);

    const config = await requestApp(app, "POST", "/configs", {
      clientId: client.body.id,
      environment: "development",
      format: "yaml",
      content: configContent
    });
    expect(config.status).toBe(201);
    expect(config.body.version).toBe(1);

    const dryRun = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.body.id,
      environment: "development",
      sourceType: "csv",
      csvContent
    });

    expect(dryRun.status).toBe(201);
    expect(dryRun.body).toMatchObject({
      configVersion: 1,
      totalRecords: 2,
      validRecords: 1,
      invalidRecords: 1,
      storedOrderCount: 0
    });
    expect(dryRun.body.normalizedPreview).toEqual([
      expect.objectContaining({
        externalOrderId: "1001",
        customerName: "Sarah Miller",
        customerEmail: "sarah@example.com",
        orderTotal: 84.5,
        currency: "EUR",
        orderDate: "2026-04-10",
        status: "paid"
      })
    ]);
    expect(dryRun.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 2,
          field: "customerEmail",
          value: "bad-email"
        }),
        expect.objectContaining({
          row: 2,
          field: "orderTotal",
          value: -12
        })
      ])
    );
    await expect(store.orders.count({ clientId: client.body.id })).resolves.toBe(0);

    const commit = await requestApp(app, "POST", "/imports", {
      clientId: client.body.id,
      environment: "development",
      sourceType: "csv",
      csvContent
    });

    expect(commit.status).toBe(201);
    expect(commit.body).toMatchObject({
      totalRecords: 2,
      validRecords: 1,
      invalidRecords: 1,
      storedOrderCount: 1
    });
    await expect(store.orders.count({ clientId: client.body.id })).resolves.toBe(1);
  });

  it("accepts the checked-in JSON demo data with the same import config", async () => {
    const { app } = createTestContext();
    const configContent = readFileSync(
      "examples/configs/urban-home-orders.yaml",
      "utf8"
    );
    const records = JSON.parse(readFileSync("examples/data/orders.json", "utf8"));

    const client = await requestApp(app, "POST", "/clients", {
      code: "urban-home-store",
      name: "Urban Home Store"
    });
    await requestApp(app, "POST", "/configs", {
      clientId: client.body.id,
      environment: "development",
      format: "yaml",
      content: configContent
    });

    const dryRun = await requestApp(app, "POST", "/imports/dry-run", {
      clientId: client.body.id,
      environment: "development",
      sourceType: "json",
      records
    });

    expect(dryRun.status).toBe(201);
    expect(dryRun.body).toMatchObject({
      totalRecords: 2,
      validRecords: 1,
      invalidRecords: 1,
      storedOrderCount: 0
    });
    expect(dryRun.body.normalizedPreview[0]).toMatchObject({
      externalOrderId: "1001",
      customerEmail: "sarah@example.com",
      currency: "EUR",
      status: "paid"
    });
  });

  it("keeps the Postman collection aligned with the local demo flow", async () => {
    const { app } = createTestContext();
    const collection = JSON.parse(
      readFileSync("postman/order-import-platform.postman_collection.json", "utf8")
    ) as PostmanCollection;
    const variables = new Map(
      collection.variable.map((variable) => [variable.key, variable.value])
    );
    const expectedOrder = [
      "Create Client",
      "Upload YAML Config",
      "Dry-Run CSV Import",
      "Dry-Run JSON Import",
      "Commit CSV Import",
      "View Batch",
      "List Orders"
    ];

    expect(collection.item.map((item) => item.name)).toEqual(expectedOrder);

    for (const item of collection.item) {
      const response = await requestApp(
        app,
        item.request.method,
        toAppPath(interpolate(item.request.url, variables), variables),
        item.request.body?.raw
          ? JSON.parse(interpolate(item.request.body.raw, variables))
          : undefined
      );

      if (item.request.method === "GET") {
        expect(response.status).toBe(200);
      } else {
        expect(response.status).toBe(201);
      }

      const body = response.body as Record<string, unknown>;
      if (item.name === "Create Client") {
        variables.set("clientId", String(body.id));
      }
      if (item.name === "Upload YAML Config") {
        variables.set("configId", String(body.id));
      }
      if (item.name === "Commit CSV Import") {
        variables.set("batchId", String(body.batchId));
        expect(body.storedOrderCount).toBe(1);
      }
      if (item.name === "Dry-Run CSV Import" || item.name === "Dry-Run JSON Import") {
        expect(body).toMatchObject({
          totalRecords: 2,
          validRecords: 1,
          invalidRecords: 1,
          storedOrderCount: 0
        });
      }
      if (item.name === "List Orders") {
        expect(body.orders).toHaveLength(1);
      }
    }
  });
});

function interpolate(value: string, variables: Map<string, string>): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    return variables.get(key) ?? "";
  });
}

function toAppPath(url: string, variables: Map<string, string>): string {
  const baseUrl = variables.get("baseUrl") ?? "";
  return url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
}
