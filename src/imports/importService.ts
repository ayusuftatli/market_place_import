import { badRequest, notFound } from "../shared/errors";
import type { DataStore } from "../shared/dataStore";
import type {
  Environment,
  ImportMode,
  ImportTemplate,
  NormalizedOrderFields,
  RowValidationError,
  SourceType
} from "../shared/types";
import { parseSourceRecords } from "./sourceParsers";
import { mapAndTransformRecord } from "../transformation/transformer";
import { createNormalizedRecordValidator } from "../validation/schemaGenerator";

export interface ImportRequestInput {
  clientId: string;
  environment: Environment;
  configVersion?: number;
  sourceType?: SourceType;
  records?: unknown;
  content?: unknown;
  csvContent?: unknown;
}

export interface ImportPipelineResult {
  batchId: string;
  configVersion: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  storedOrderCount: number;
  errors: RowValidationError[];
  normalizedPreview: NormalizedOrderFields[];
}

export async function runImportPipeline(
  store: DataStore,
  mode: ImportMode,
  input: ImportRequestInput
): Promise<ImportPipelineResult> {
  const client = await store.clients.findById(input.clientId);
  if (!client) {
    throw notFound("Client not found");
  }

  const importConfig = input.configVersion
    ? await store.configs.findByVersion(
        input.clientId,
        input.environment,
        input.configVersion
      )
    : await store.configs.findLatest(input.clientId, input.environment);

  if (!importConfig) {
    throw notFound("Import config not found for client/environment");
  }

  const sourceType = input.sourceType ?? importConfig.config.source.type;
  const sourceRecords = parseSourceRecords({
    sourceType,
    records: input.records,
    content: input.content,
    csvContent: input.csvContent
  });

  const processed = processRecords(importConfig.config, sourceRecords);
  const allowPartialSuccess =
    importConfig.config.settings?.allowPartialSuccess ?? true;
  const shouldStore =
    mode === "commit" &&
    processed.validOrders.length > 0 &&
    (allowPartialSuccess || processed.invalidRecords === 0);
  const storedRecords = shouldStore ? processed.validOrders.length : 0;

  const batch = await store.batches.create({
    clientId: input.clientId,
    environment: input.environment,
    configId: importConfig.id,
    configVersion: importConfig.version,
    sourceType,
    mode,
    totalRecords: sourceRecords.length,
    validRecords: processed.validRecords,
    invalidRecords: processed.invalidRecords,
    storedRecords,
    errors: processed.errors
  });

  if (shouldStore) {
    await store.orders.createMany(
      processed.validOrders.map((order) => ({
        ...order,
        batchId: batch.id,
        clientId: input.clientId
      }))
    );
  }

  return {
    batchId: batch.id,
    configVersion: importConfig.version,
    totalRecords: sourceRecords.length,
    validRecords: processed.validRecords,
    invalidRecords: processed.invalidRecords,
    storedOrderCount: storedRecords,
    errors: processed.errors,
    normalizedPreview: processed.validOrders
      .slice(0, importConfig.config.settings?.previewLimit ?? 25)
      .map(({ sourceRecord: _sourceRecord, ...order }) => order)
  };
}

function processRecords(
  config: ImportTemplate,
  sourceRecords: Array<Record<string, unknown>>
): {
  validRecords: number;
  invalidRecords: number;
  errors: RowValidationError[];
  validOrders: Array<NormalizedOrderFields & { sourceRecord: Record<string, unknown> }>;
} {
  const maxErrors = config.settings?.maxErrors ?? 50;
  const errors: RowValidationError[] = [];
  const validOrders: Array<
    NormalizedOrderFields & { sourceRecord: Record<string, unknown> }
  > = [];
  const validateRecord = createNormalizedRecordValidator(config);
  let validRecords = 0;
  let invalidRecords = 0;

  sourceRecords.forEach((sourceRecord, index) => {
    const row = index + 1;
    const transformed = mapAndTransformRecord(sourceRecord, config);
    const validation = validateRecord(transformed.normalized, row, {
      maxErrors: Math.max(maxErrors - errors.length, 0)
    });

    if (!validation.valid) {
      invalidRecords += 1;
      errors.push(...validation.errors);
      return;
    }

    validRecords += 1;
    validOrders.push({
      ...(transformed.normalized as unknown as NormalizedOrderFields),
      sourceRecord: transformed.sourceRecord
    });
  });

  return {
    validRecords,
    invalidRecords,
    errors,
    validOrders
  };
}

export function normalizeImportRequestBody(body: Record<string, unknown>): {
  configVersion?: number;
  sourceType?: SourceType;
} {
  const configVersion =
    body.configVersion === undefined ? undefined : Number(body.configVersion);
  if (configVersion !== undefined && !Number.isInteger(configVersion)) {
    throw badRequest("configVersion must be an integer");
  }

  const sourceType = body.sourceType;
  if (
    sourceType !== undefined &&
    sourceType !== "csv" &&
    sourceType !== "json"
  ) {
    throw badRequest("sourceType must be 'csv' or 'json'");
  }

  return {
    configVersion,
    sourceType
  };
}
