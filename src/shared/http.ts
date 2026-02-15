import { Types } from "mongoose";
import { badRequest } from "./errors";

export function assertObjectId(id: string, label = "id"): void {
  if (!Types.ObjectId.isValid(id)) {
    throw badRequest(`Invalid ${label}`);
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw badRequest(`${field} is required`);
  }

  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
