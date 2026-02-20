import { Router } from "express";
import { asyncHandler } from "../shared/asyncHandler";
import type { DataStore } from "../shared/dataStore";
import { badRequest, notFound } from "../shared/errors";
import { requireString } from "../shared/http";
import type { OrderListSort, OrderSummaryListQuery } from "../shared/types";

const supportedOrderSorts = [
  "createdAt:desc",
  "createdAt:asc",
  "orderDate:desc",
  "orderDate:asc",
  "totalAmount:desc",
  "totalAmount:asc",
] as const satisfies readonly OrderListSort[];

export function createOrderRouter(store: DataStore): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const result = await store.orders.listPage(
        parseOrderListQuery(req.query),
      );
      res.json(result);
    }),
  );

  router.get(
    "/:id/lines",
    asyncHandler(async (req, res) => {
      const id = requireString(req.params.id, "id");
      const order = await store.orders.findById(id);
      if (!order) {
        throw notFound("Order not found");
      }

      const lines = await store.orderLines.list({ orderId: id });
      res.json({ lines });
    }),
  );

  return router;
}

function parseOrderListQuery(
  query: Record<string, unknown>,
): OrderSummaryListQuery {
  return {
    q: optionalQueryString(query, "q"),
    importRunId: optionalQueryString(query, "importRunId"),
    salesChannel: optionalQueryString(query, "salesChannel"),
    orderStatus: optionalQueryString(query, "orderStatus"),
    paymentStatus: optionalQueryString(query, "paymentStatus"),
    fulfillmentStatus: optionalQueryString(query, "fulfillmentStatus"),
    dateFrom: parseDateQuery(query, "dateFrom"),
    dateTo: parseDateQuery(query, "dateTo"),
    minTotal: parseNumberQuery(query, "minTotal"),
    maxTotal: parseNumberQuery(query, "maxTotal"),
    sort: parseSortQuery(query),
    page: parsePageQuery(query),
    pageSize: parsePageSizeQuery(query),
  };
}

function optionalQueryString(
  query: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = query[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a single value`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNumberQuery(
  query: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw badRequest(`${field} must be a valid number`);
  }

  return number;
}

function parseDateQuery(
  query: Record<string, unknown>,
  field: "dateFrom" | "dateTo",
): string | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }
  if (!isValidIsoDate(value)) {
    throw badRequest(`${field} must be a valid YYYY-MM-DD date`);
  }

  return value;
}

function parseSortQuery(query: Record<string, unknown>): OrderListSort {
  const value = optionalQueryString(query, "sort") ?? "createdAt:desc";
  if (isOrderListSort(value)) {
    return value;
  }

  throw badRequest(`sort must be one of ${supportedOrderSorts.join(", ")}`);
}

function parsePageQuery(query: Record<string, unknown>): number {
  const value = optionalQueryString(query, "page");
  return value === undefined ? 1 : parsePositiveInteger(value, "page");
}

function parsePageSizeQuery(query: Record<string, unknown>): number {
  const value = optionalQueryString(query, "pageSize");
  if (value === undefined) {
    return 25;
  }

  return Math.min(parsePositiveInteger(value, "pageSize"), 100);
}

function parsePositiveInteger(value: string, field: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw badRequest(`${field} must be a positive integer`);
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw badRequest(`${field} must be a safe integer`);
  }

  return number;
}

function isOrderListSort(value: string): value is OrderListSort {
  return supportedOrderSorts.includes(value as OrderListSort);
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
