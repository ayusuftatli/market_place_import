import type { ImportTemplate, TransformStep } from "../shared/types";
import type { SourceRecord } from "../imports/sourceParsers";

export interface TransformedRecord {
  normalized: Record<string, unknown>;
  sourceRecord: SourceRecord;
}

export function mapAndTransformRecord(
  sourceRecord: SourceRecord,
  config: ImportTemplate
): TransformedRecord {
  const normalized: Record<string, unknown> = {};

  for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
    const aliases = [fieldName, ...(fieldConfig.aliases ?? [])];
    let value = findSourceValue(sourceRecord, aliases);

    for (const step of normalizeSteps(config.transforms?.[fieldName])) {
      value = applyTransform(step, value, sourceRecord);
    }

    if (value !== undefined) {
      normalized[fieldName] = value;
    }
  }

  return {
    normalized,
    sourceRecord
  };
}

export function findSourceValue(
  sourceRecord: SourceRecord,
  aliases: string[]
): unknown {
  const sourceKeys = new Map<string, string>();
  for (const key of Object.keys(sourceRecord)) {
    sourceKeys.set(normalizeKey(key), key);
  }

  for (const alias of aliases) {
    const key = sourceKeys.get(normalizeKey(alias));
    if (key !== undefined) {
      return sourceRecord[key];
    }
  }

  return undefined;
}

function normalizeSteps(
  steps: TransformStep | TransformStep[] | undefined
): TransformStep[] {
  if (!steps) {
    return [];
  }

  return Array.isArray(steps) ? steps : [steps];
}

function applyTransform(
  step: TransformStep,
  value: unknown,
  sourceRecord: SourceRecord
): unknown {
  const normalizedStep = typeof step === "string" ? { type: step } : step;

  switch (normalizedStep.type) {
    case "source":
      return normalizedStep.field
        ? findSourceValue(sourceRecord, [normalizedStep.field])
        : value;
    case "default":
      return isMissing(value) ? normalizedStep.value ?? normalizedStep.default : value;
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
      return value;
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
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

  const number = Number(trimmed.replace(/,/g, ""));
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
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) ? trimmed : value;
  }

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : value;
}

function mapEnum(
  value: unknown,
  map: Record<string, unknown> | undefined
): unknown {
  if (!map || isMissing(value)) {
    return value;
  }

  const key = String(value);
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
