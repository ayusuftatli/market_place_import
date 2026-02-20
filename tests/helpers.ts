import type { Express } from "express";
import { createApp, type CreateAppOptions } from "../src/app";
import { createMongoDataStore, type DataStore } from "../src/shared/dataStore";
import {
  AMAZON_SAMPLE_TSV,
  GENERIC_SAMPLE_CSV,
  GENERIC_SAMPLE_JSON,
  SHOPIFY_SAMPLE_CSV,
} from "../ui/src/demoData";

export function createTestContext(
  options: Omit<CreateAppOptions, "store"> = {},
): { app: Express; store: DataStore } {
  const store = createMongoDataStore();
  return {
    app: createApp({ store, ...options }),
    store,
  };
}

export const amazonTsv = AMAZON_SAMPLE_TSV;
export const shopifyCsv = SHOPIFY_SAMPLE_CSV;
export const genericCsv = GENERIC_SAMPLE_CSV;
export const genericJson = GENERIC_SAMPLE_JSON;

export const genericMixedJson = [
  ...GENERIC_SAMPLE_JSON,
  {
    "Marketplace Order ID": "GEN-ERR-1",
    Channel: "Agency Sheet",
    "Order Date": "2026-04-16",
    "Order Status": "paid",
    "Payment Status": "paid",
    Currency: "GBP",
    Quantity: "0",
    "Unit Price": "12.00",
    "Line Total": "12.00",
    Tax: "2.40",
    Discount: "0.00",
    Shipping: "4.00",
  },
];
