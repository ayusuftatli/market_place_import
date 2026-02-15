import type { Express } from "express";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { createTestContext, demoConfig } from "./helpers";
import { requestApp, type TestResponse } from "./httpTestClient";

interface ConfigResponse {
  id: string;
  clientId: string;
  environment: "development" | "production";
  version: number;
  format: "yaml" | "json";
  config: {
    environment: "development" | "production";
    version: number;
    source: {
      type: "csv" | "json";
      name?: string;
    };
  };
  promotedFromVersion?: number;
}

async function createClient(app: Express, code = "urban-home-store") {
  const response = await requestApp(app, "POST", "/clients", {
    code,
    name: "Urban Home Store"
  });

  return response.body as { id: string; code: string; name: string };
}

function configBody(response: TestResponse): ConfigResponse {
  return response.body as ConfigResponse;
}

describe("import config API", () => {
  it("uploads YAML and JSON content, keeps older versions, and returns details", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    const yaml = `
client: urban-home-store
environment: development
source:
  type: csv
fields:
  externalOrderId:
    type: string
    required: true
    aliases:
      - Order ID
`;

    const yamlResponse = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      format: "yaml",
      content: yaml
    });

    expect(yamlResponse.status).toBe(201);
    const yamlConfig = configBody(yamlResponse);
    expect(yamlConfig).toMatchObject({
      clientId: client.id,
      environment: "development",
      version: 1,
      format: "yaml"
    });
    expect(yamlConfig.config.version).toBe(1);

    const jsonResponse = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      format: "json",
      content: JSON.stringify(
        demoConfig({ source: { type: "json", name: "json-order-export" } })
      )
    });

    expect(jsonResponse.status).toBe(201);
    const jsonConfig = configBody(jsonResponse);
    expect(jsonConfig.version).toBe(2);
    expect(jsonConfig.config).toMatchObject({
      version: 2,
      source: {
        type: "json"
      }
    });

    const detail = await requestApp(app, "GET", `/configs/${yamlConfig.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: yamlConfig.id,
      version: 1
    });

    const list = await requestApp(
      app,
      "GET",
      `/configs?clientId=${client.id}&environment=development`
    );
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      configs: [
        expect.objectContaining({ id: jsonConfig.id, version: 2 }),
        expect.objectContaining({ id: yamlConfig.id, version: 1 })
      ]
    });
  });

  it("increments versions independently per client and environment", async () => {
    const { app } = createTestContext();
    const firstClient = await createClient(app, "urban-home-store");
    const secondClient = await createClient(app, "bright-garden-store");

    const firstDevelopment = await requestApp(app, "POST", "/configs", {
      clientId: firstClient.id,
      environment: "development",
      config: demoConfig()
    });
    const secondDevelopment = await requestApp(app, "POST", "/configs", {
      clientId: firstClient.id,
      environment: "development",
      config: demoConfig()
    });
    const firstProduction = await requestApp(app, "POST", "/configs", {
      clientId: firstClient.id,
      environment: "production",
      config: demoConfig({ environment: "production" })
    });
    const otherClientDevelopment = await requestApp(app, "POST", "/configs", {
      clientId: secondClient.id,
      environment: "development",
      config: demoConfig()
    });

    expect(configBody(firstDevelopment).version).toBe(1);
    expect(configBody(secondDevelopment).version).toBe(2);
    expect(configBody(firstProduction).version).toBe(1);
    expect(configBody(otherClientDevelopment).version).toBe(1);
  });

  it("promotes development configs into production versions", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);
    const sourceResponse = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      config: demoConfig()
    });
    const existingProduction = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "production",
      config: demoConfig({ environment: "production" })
    });

    const promoted = await requestApp(
      app,
      "POST",
      `/configs/${configBody(sourceResponse).id}/promote`
    );

    expect(promoted.status).toBe(201);
    expect(promoted.body).toMatchObject({
      clientId: client.id,
      environment: "production",
      version: 2,
      promotedFromVersion: 1,
      config: {
        environment: "production",
        version: 2
      }
    });

    const rejected = await requestApp(
      app,
      "POST",
      `/configs/${configBody(existingProduction).id}/promote`
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({
      error: {
        message: "Only development configs can be promoted"
      }
    });
  });

  it("rejects invalid configs before storage", async () => {
    const { app } = createTestContext();
    const client = await createClient(app);

    const missingFields = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      config: {
        environment: "development",
        source: { type: "csv" }
      }
    });
    expect(missingFields.status).toBe(400);
    expect(missingFields.body).toMatchObject({
      error: {
        message: "Invalid import config"
      }
    });

    const unsupportedFormat = demoConfig();
    unsupportedFormat.fields.orderDate.format = "calendar-date";
    const invalidFieldFormat = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      config: unsupportedFormat
    });
    expect(invalidFieldFormat.status).toBe(400);
    expect(invalidFieldFormat.body).toEqual({
      error: {
        message: "Field 'orderDate' uses unsupported format 'calendar-date'"
      }
    });

    const badUploadFormat = await requestApp(app, "POST", "/configs", {
      clientId: client.id,
      environment: "development",
      format: "toml",
      config: demoConfig()
    });
    expect(badUploadFormat.status).toBe(400);
    expect(badUploadFormat.body).toEqual({
      error: {
        message: "format must be 'yaml' or 'json'"
      }
    });

    const list = await requestApp(
      app,
      "GET",
      `/configs?clientId=${client.id}&environment=development`
    );
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ configs: [] });
  });

  it("returns clean errors for invalid or missing config ids", async () => {
    const { app } = createTestContext();

    const invalidDetail = await requestApp(app, "GET", "/configs/not-an-id");
    expect(invalidDetail.status).toBe(400);
    expect(invalidDetail.body).toEqual({
      error: {
        message: "Invalid id"
      }
    });

    const missingDetail = await requestApp(
      app,
      "GET",
      `/configs/${new Types.ObjectId().toString()}`
    );
    expect(missingDetail.status).toBe(404);
    expect(missingDetail.body).toEqual({
      error: {
        message: "Config not found"
      }
    });
  });
});
