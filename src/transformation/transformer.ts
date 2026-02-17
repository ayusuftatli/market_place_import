import { badRequest } from "../shared/errors";
import type {
  FieldConfig,
  TransformStep,
} from "../shared/types";

export type SourceRecord = Record<string, unknown>;

export interface TransformedRecord {
  normalized: Record<string, unknown>;
  sourceRecord: SourceRecord;
}

export function mapAndTransformRecord(
  sourceRecord: SourceRecord,
  fields: Record<string, FieldConfig>,
  transforms?: Record<string, TransformStep | TransformStep[]>,
): TransformedRecord {
  const normalized: Record<string, unknown> = {};

  for (const [fieldName, fieldConfig] of Object.entries(fields)) {
    const aliases = [fieldName, ...(fieldConfig.aliases ?? [])];
    let value = findSourceValue(sourceRecord, aliases);

    for (const step of normalizeSteps(transforms?.[fieldName])) {
      value = applyTransform(step, value, sourceRecord);
    }

    if (value !== undefined) {
      normalized[fieldName] = value;
    }
  }

  return {
    normalized,
    sourceRecord: { ...sourceRecord },
  };
}

export function findSourceValue(
  sourceRecord: SourceRecord,
  aliases: string[],
): unknown {
  const sourceKeys = new Map<string, string>();

  for (const key of Object.keys(sourceRecord)) {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey.length > 0 && !sourceKeys.has(normalizedKey)) {
      sourceKeys.set(normalizedKey, key);
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (normalizedAlias.length === 0) {
      continue;
    }

    const key = sourceKeys.get(normalizedAlias);
    if (key !== undefined) {
      return sourceRecord[key];
    }
  }

  return undefined;
}

export function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function normalizeSteps(
  steps: TransformStep | TransformStep[] | undefined,
): TransformStep[] {
  if (!steps) {
    return [];
  }

  return Array.isArray(steps) ? steps : [steps];
}

function applyTransform(
  step: TransformStep,
  value: unknown,
  sourceRecord: SourceRecord,
): unknown {
  const normalizedStep = typeof step === "string" ? { type: step } : step;

  switch (normalizedStep.type) {
    case "source":
      return normalizedStep.field
        ? findSourceValue(sourceRecord, [normalizedStep.field])
        : value;
    case "default":
      return isMissing(value) ? getDefaultValue(normalizedStep) : value;
    case "trim":
      return typeof value === "string" ? value.trim() : value;
    case "uppercase":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "lowercase":
      return typeof value === "string" ? value.toLowerCase() : value;
    case "numberCoerce":
      return coerceNumber(value);
    case "dateNormalize":
      return normalizeDate(value);
    case "enumMap":
      return mapEnum(value, normalizedStep.map);
    default:
      throw badRequest(`Unsupported transform '${String(normalizedStep.type)}'`);
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getDefaultValue(step: { value?: unknown; default?: unknown }): unknown {
  if (Object.prototype.hasOwnProperty.call(step, "value")) {
    return step.value;
  }

  return step.default;
}

function coerceNumber(value: unknown): unknown {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const sanitized = trimmed.replace(/[$€£,\s]/g, "");
  const number = Number(sanitized);
  return Number.isFinite(number) ? number : value;
}

function normalizeDate(value: unknown): unknown {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoDate) {
    return isValidIsoDate(
      Number(isoDate[1]),
      Number(isoDate[2]),
      Number(isoDate[3]),
    )
      ? `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
      : value;
  }

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : value;
}

function isValidIsoDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function mapEnum(
  value: unknown,
  map: Record<string, unknown> | undefined,
): unknown {
  if (!map || isMissing(value)) {
    return value;
  }

  const key = typeof value === "string" ? value.trim() : String(value);
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return map[key];
  }

  const lowerKey = key.toLowerCase();
  for (const [candidate, mappedValue] of Object.entries(map)) {
    if (candidate.toLowerCase() === lowerKey) {
      return mappedValue;
    }
  }

  return value;
}
