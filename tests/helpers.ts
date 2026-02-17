import type { Express } from "express";
import { createApp, type CreateAppOptions } from "../src/app";
import { createMemoryDataStore, type DataStore } from "../src/shared/dataStore";
import type { ImportTemplate } from "../src/shared/types";

export function createTestContext(
  options: Omit<CreateAppOptions, "store"> = {}
): { app: Express; store: DataStore } {
  const store = createMemoryDataStore();
  return {
    app: createApp({ store, ...options }),
    store
  };
}

export function demoConfig(
  overrides: Partial<ImportTemplate> = {}
): ImportTemplate {
  return {
    environment: "development",
    source: {
      type: "csv",
      name: "partner-order-export"
    },
    fields: {
      externalOrderId: {
        type: "string",
        required: true,
        aliases: ["Order ID", "order_id", "id"]
      },
      customerEmail: {
        type: "string",
        required: true,
        format: "email",
        aliases: ["Customer Email", "email"]
      },
      customerName: {
        type: "string",
        aliases: ["Full Name", "Customer Name"]
      },
      orderTotal: {
        type: "number",
        required: true,
        min: 0,
        aliases: ["Total", "Order Total"]
      },
      currency: {
        type: "string",
        required: true,
        enum: ["USD", "EUR", "GBP"],
        aliases: ["Currency"]
      },
      orderDate: {
        type: "string",
        required: true,
        format: "date",
        aliases: ["Order Date"]
      },
      status: {
        type: "string",
        required: true,
        enum: ["paid", "pending", "cancelled", "refunded"],
        aliases: ["Status"]
      }
    },
    transforms: {
      externalOrderId: ["trim"],
      customerEmail: ["trim", "lowercase"],
      customerName: ["trim", { type: "default", value: "Unknown Customer" }],
      orderTotal: ["trim", "numberCoerce"],
      currency: ["trim", "uppercase", { type: "default", value: "USD" }],
      orderDate: ["trim", "dateNormalize"],
      status: [
        "trim",
        "lowercase",
        {
          type: "enumMap",
          map: {
            paid: "paid",
            complete: "paid",
            completed: "paid",
            pending: "pending",
            cancelled: "cancelled",
            canceled: "cancelled",
            refunded: "refunded"
          }
        }
      ]
    },
    settings: {
      allowPartialSuccess: true,
      maxErrors: 20,
      previewLimit: 10
    },
    ...overrides
  };
}

export const mixedCsv = `Order ID,Customer Email,Full Name,Total,Currency,Order Date,Status
1001,sarah@example.com,Sarah Miller,84.50,eur,2026-04-10,Paid
1002,bad-email,Tom Becker,-12.00,usd,2026-04-11,Paid`;

export const validCsv = `Order ID,Customer Email,Full Name,Total,Currency,Order Date,Status
1001,sarah@example.com,Sarah Miller,84.50,eur,2026-04-10,Paid`;
