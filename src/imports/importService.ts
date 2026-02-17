import type { DataStore } from "../shared/dataStore";
import type {
  CreateOrderLineInput,
  CreateOrderSummaryInput,
  FieldConfig,
  ImportMode,
  ImportPipelineResult,
  ImportRequestInput,
  MarketplaceTemplate,
  OrderLineFields,
  OrderSummaryFields,
  RollupFieldConfig,
  RowValidationError,
} from "../shared/types";
import { applyTemplatePreprocessing, parseSourceInput } from "./sourceParsers";
import { mapAndTransformRecord, isMissing } from "../transformation/transformer";
import { createRecordValidator } from "../validation/schemaGenerator";
import { resolveTemplate } from "../templates/templateService";
import { badRequest } from "../shared/errors";

interface ValidLineRecord {
  rowNumber: number;
  normalized: Record<string, unknown>;
  sourceRecord: Record<string, unknown>;
}

interface RolledUpOrder {
  firstRowNumber: number;
  summary: OrderSummaryFields;
  lines: ValidLineRecord[];
}

const publicLineFields = [
  "sourceOrderId",
  "sourceLineId",
  "salesChannel",
  "sku",
  "asin",
  "productTitle",
  "variantTitle",
  "quantity",
  "unitPriceAmount",
  "lineSubtotalAmount",
  "lineTaxAmount",
  "lineDiscountAmount",
  "currency",
  "lineStatus",
] as const;

type PublicLineField = (typeof publicLineFields)[number];

export async function runImportPipeline(
  store: DataStore,
  mode: ImportMode,
  input: ImportRequestInput,
): Promise<ImportPipelineResult> {
  const template = await resolveTemplate(store, input.templateKey);
  const parsed = parseSourceInput(input);
  const sourceRecords = applyTemplatePreprocessing(parsed.records, template);
  const processed = processSourceRecords(template, sourceRecords);
  const allowPartialSuccess = template.settings?.allowPartialSuccess ?? true;
  const shouldStore =
    mode === "commit" &&
    processed.orders.length > 0 &&
    (allowPartialSuccess || processed.invalidRecords === 0);

  const previewLimit = template.settings?.previewLimit ?? 10;
  const orderPreview = processed.orders
    .slice(0, previewLimit)
    .map((order) => order.summary);
  const linePreview = processed.orders
    .flatMap((order) => order.lines)
    .slice(0, previewLimit)
    .map((line) => toOrderLineFields(line.normalized));

  const storedOrderCount = shouldStore ? processed.orders.length : 0;
  const storedLineCount = shouldStore
    ? processed.orders.reduce((total, order) => total + order.lines.length, 0)
    : 0;

  const run = await store.importRuns.create({
    templateKey: template.key,
    templateVersion: template.templateVersion,
    fileName: input.fileName,
    inputKind: input.inputKind,
    sourceKind: parsed.sourceKind,
    mode,
    totalRecords: sourceRecords.length,
    validRecords: processed.validRecords,
    invalidRecords: processed.invalidRecords,
    storedOrderCount,
    storedLineCount,
    errors: processed.errors,
    orderPreview,
    linePreview,
  });

  if (shouldStore) {
    const createdOrders = await store.orders.createMany(
      processed.orders.map<CreateOrderSummaryInput>((order) => ({
        importRunId: run.id,
        ...order.summary,
      })),
    );
    const orderIds = new Map(
      createdOrders.map((order) => [order.sourceOrderId, order.id]),
    );

    await store.orderLines.createMany(
      processed.orders.flatMap((order) =>
        order.lines.map<CreateOrderLineInput>((line) => ({
          importRunId: run.id,
          orderId: orderIds.get(order.summary.sourceOrderId) ?? "",
          ...toOrderLineFields(line.normalized),
          sourceRecord: line.sourceRecord,
          rowNumber: line.rowNumber,
        })),
      ),
    );
  }

  return {
    importRunId: run.id,
    templateVersion: template.templateVersion,
    totalRecords: sourceRecords.length,
    validRecords: processed.validRecords,
    invalidRecords: processed.invalidRecords,
    storedOrderCount,
    storedLineCount,
    errors: processed.errors,
    orderPreview,
    linePreview,
  };
}

function processSourceRecords(
  template: MarketplaceTemplate,
  sourceRecords: Array<Record<string, unknown>>,
): {
  validRecords: number;
  invalidRecords: number;
  errors: RowValidationError[];
  orders: RolledUpOrder[];
} {
  const maxErrors = template.settings?.maxErrors ?? 50;
  const lineValidator = createRecordValidator(template.lineFields);
  const orderValidator = createRecordValidator(toOrderFieldConfigMap(template));
  const errors: RowValidationError[] = [];
  const validLines: ValidLineRecord[] = [];
  let validRecords = 0;
  let invalidRecords = 0;

  for (const [index, sourceRecord] of sourceRecords.entries()) {
    const rowNumber = index + 1;
    const transformed = mapAndTransformRecord(
      sourceRecord,
      template.lineFields,
      template.transforms,
    );
    const finalized = finalizeLineRecord(transformed.normalized);
    const validation = lineValidator(finalized, rowNumber, {
      maxErrors: Math.max(maxErrors - errors.length, 0),
    });

    if (!validation.valid) {
      invalidRecords += 1;
      errors.push(...validation.errors);
      continue;
    }

    validRecords += 1;
    validLines.push({
      rowNumber,
      normalized: finalized,
      sourceRecord: transformed.sourceRecord,
    });
  }

  const rolledUpOrders = rollUpOrders(template, validLines);
  const validOrders: RolledUpOrder[] = [];

  for (const order of rolledUpOrders) {
    const validation = orderValidator(order.summary as unknown as Record<string, unknown>, order.firstRowNumber, {
      maxErrors: Math.max(maxErrors - errors.length, 0),
    });

    if (!validation.valid) {
      errors.push(...validation.errors);
      continue;
    }

    validOrders.push(order);
  }

  return {
    validRecords,
    invalidRecords,
    errors,
    orders: validOrders,
  };
}

function rollUpOrders(
  template: MarketplaceTemplate,
  validLines: ValidLineRecord[],
): RolledUpOrder[] {
  const grouped = new Map<string, RolledUpOrder>();

  for (const line of validLines) {
    const keyField = template.orderRollup.keyField;
    const sourceOrderId = line.normalized[keyField];
    if (typeof sourceOrderId !== "string" || sourceOrderId.length === 0) {
      throw badRequest(`Normalized line is missing rollup key '${keyField}'`);
    }

    const existing = grouped.get(sourceOrderId);
    if (existing) {
      existing.lines.push(line);
      continue;
    }

    grouped.set(sourceOrderId, {
      firstRowNumber: line.rowNumber,
      summary: {} as OrderSummaryFields,
      lines: [line],
    });
  }

  return [...grouped.values()].map((group) => ({
    ...group,
    summary: finalizeOrderSummary(
      computeOrderSummary(template, group.lines),
    ),
  }));
}

function computeOrderSummary(
  template: MarketplaceTemplate,
  lines: ValidLineRecord[],
): OrderSummaryFields {
  const summary = {} as Record<string, unknown>;

  for (const [fieldName, config] of Object.entries(template.orderRollup.fields)) {
    const value = computeRollupValue(lines, config);
    if (value !== undefined) {
      summary[fieldName] = value;
    }
  }

  return summary as unknown as OrderSummaryFields;
}

function computeRollupValue(
  lines: ValidLineRecord[],
  config: RollupFieldConfig,
): unknown {
  if (Object.prototype.hasOwnProperty.call(config, "value")) {
    return config.value;
  }

  if (config.aggregate === "count") {
    return lines.length;
  }

  if (!config.fromLineField) {
    return undefined;
  }

  const fromLineField = config.fromLineField;
  const values = lines.map((line) => line.normalized[fromLineField]);

  switch (config.aggregate ?? "first") {
    case "sum":
      return values.reduce<number>(
        (total, value) => total + numberValue(value),
        0,
      );
    case "firstNonEmpty":
      return values.find((value) => !isMissing(value));
    case "first":
    default:
      return values[0];
  }
}

function finalizeLineRecord(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };

  if (!isMissing(next.quantity)) {
    next.quantity = numberValue(next.quantity);
  }

  next.lineTaxAmount =
    numberValue(next.lineTaxAmount) + numberValue(next.shippingTaxAmount);
  next.lineDiscountAmount =
    numberValue(next.lineDiscountAmount) + numberValue(next.shippingDiscountAmount);
  next.lineShippingAmount = numberValue(next.lineShippingAmount);

  if (isMissing(next.lineSubtotalAmount) && !isMissing(next.unitPriceAmount)) {
    const quantity = numberValue(next.quantity, Number.NaN);
    if (Number.isFinite(quantity)) {
      next.lineSubtotalAmount = numberValue(next.unitPriceAmount) * quantity;
    }
  }

  if (isMissing(next.unitPriceAmount) && !isMissing(next.lineSubtotalAmount)) {
    const quantity = numberValue(next.quantity, Number.NaN);
    if (quantity > 0) {
      next.unitPriceAmount = numberValue(next.lineSubtotalAmount) / quantity;
    }
  }

  if (!isMissing(next.unitPriceAmount)) {
    next.unitPriceAmount = numberValue(next.unitPriceAmount);
  }
  if (!isMissing(next.lineSubtotalAmount)) {
    next.lineSubtotalAmount = numberValue(next.lineSubtotalAmount);
  }

  return next;
}

function finalizeOrderSummary(summary: OrderSummaryFields): OrderSummaryFields {
  return {
    ...summary,
    salesChannel: typeof summary.salesChannel === "string" ? summary.salesChannel : "unknown",
    currency: typeof summary.currency === "string" ? summary.currency : "USD",
    subtotalAmount: numberValue(summary.subtotalAmount),
    shippingAmount: numberValue(summary.shippingAmount),
    taxAmount: numberValue(summary.taxAmount),
    discountAmount: numberValue(summary.discountAmount),
    totalAmount: isMissing(summary.totalAmount)
      ? numberValue(summary.subtotalAmount) +
        numberValue(summary.shippingAmount) +
        numberValue(summary.taxAmount) -
        numberValue(summary.discountAmount)
      : numberValue(summary.totalAmount),
    itemQuantity: numberValue(summary.itemQuantity),
    lineCount: numberValue(summary.lineCount),
  };
}

function toOrderFieldConfigMap(
  template: MarketplaceTemplate,
): Record<string, FieldConfig> {
  const fields: Record<string, FieldConfig> = {};

  for (const [fieldName, config] of Object.entries(template.orderRollup.fields)) {
    fields[fieldName] = {
      type: config.type ?? inferFieldType(config.value),
      required: config.required,
      format: config.format,
      pattern: config.pattern,
      enum: config.enum,
      min: config.min,
      max: config.max,
    };
  }

  return fields;
}

function inferFieldType(value: unknown): FieldConfig["type"] {
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  return "string";
}

function toOrderLineFields(record: Record<string, unknown>): OrderLineFields {
  const normalized: Partial<Record<PublicLineField, unknown>> = {};

  for (const field of publicLineFields) {
    if (record[field] !== undefined) {
      normalized[field] = record[field];
    }
  }

  return normalized as OrderLineFields;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
