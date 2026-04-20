import { ImportRunModel } from "../imports/importRunModel";
import { OrderLineModel } from "../orders/orderLineModel";
import { OrderSummaryModel } from "../orders/orderSummaryModel";
import { TemplateOverrideModel } from "../templates/templateOverrideModel";
import type {
  CreateImportRunInput,
  CreateOrderLineInput,
  CreateOrderSummaryInput,
  CreateTemplateOverrideInput,
  ImportRunEntity,
  OrderListSort,
  OrderLineEntity,
  OrderLineFields,
  OrderSummaryEntity,
  OrderSummaryListQuery,
  OrderSummaryListResult,
  TemplateOverrideEntity,
} from "./types";

export interface TemplateOverrideRepository {
  list(): Promise<Map<string, TemplateOverrideEntity>>;
  findByKey(key: string): Promise<TemplateOverrideEntity | null>;
  upsert(input: CreateTemplateOverrideInput): Promise<TemplateOverrideEntity>;
  deleteByKey(key: string): Promise<void>;
}

export interface ImportRunRepository {
  create(input: CreateImportRunInput): Promise<ImportRunEntity>;
  list(): Promise<ImportRunEntity[]>;
  findById(id: string): Promise<ImportRunEntity | null>;
}

export interface OrderSummaryRepository {
  createMany(input: CreateOrderSummaryInput[]): Promise<OrderSummaryEntity[]>;
  list(filter?: { importRunId?: string }): Promise<OrderSummaryEntity[]>;
  listPage(query?: OrderSummaryListQuery): Promise<OrderSummaryListResult>;
  findById(id: string): Promise<OrderSummaryEntity | null>;
}

export interface OrderLineRepository {
  createMany(input: CreateOrderLineInput[]): Promise<OrderLineEntity[]>;
  findExistingRowFingerprints(
    candidates: OrderLineDeduplicationCandidate[],
  ): Promise<Set<string>>;
  list(filter?: {
    importRunId?: string;
    orderId?: string;
  }): Promise<OrderLineEntity[]>;
  count(filter?: { importRunId?: string; orderId?: string }): Promise<number>;
}

export interface DataStore {
  templateOverrides: TemplateOverrideRepository;
  importRuns: ImportRunRepository;
  orders: OrderSummaryRepository;
  orderLines: OrderLineRepository;
}

export interface OrderLineDeduplicationCandidate {
  rowFingerprint: string;
  fields: OrderLineFields;
}

function toEntity<T extends { _id: unknown }>(
  doc: T,
): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return {
    id: String(_id),
    ...rest,
  } as Omit<T, "_id"> & { id: string };
}

export function createMongoDataStore(): DataStore {
  return {
    templateOverrides: {
      async list() {
        const docs = await TemplateOverrideModel.find().lean();
        return new Map(
          docs.map((doc) => {
            const entity = toEntity(doc) as TemplateOverrideEntity;
            return [entity.key, entity];
          }),
        );
      },
      async findByKey(key) {
        const doc = await TemplateOverrideModel.findOne({ key }).lean();
        return doc ? (toEntity(doc) as TemplateOverrideEntity) : null;
      },
      async upsert(input) {
        const doc = await TemplateOverrideModel.findOneAndUpdate(
          { key: input.key },
          {
            $set: {
              format: input.format,
              content: input.content,
              template: input.template,
              templateVersion: input.templateVersion,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          },
        ).lean();

        return toEntity(doc) as TemplateOverrideEntity;
      },
      async deleteByKey(key) {
        await TemplateOverrideModel.deleteOne({ key });
      },
    },
    importRuns: {
      async create(input) {
        const doc = await ImportRunModel.create(input);
        return toEntity(doc.toObject()) as ImportRunEntity;
      },
      async list() {
        const docs = await ImportRunModel.find().sort({ createdAt: -1 }).lean();
        return docs.map((doc) => toEntity(doc) as ImportRunEntity);
      },
      async findById(id) {
        const doc = await ImportRunModel.findById(id).lean();
        return doc ? (toEntity(doc) as ImportRunEntity) : null;
      },
    },
    orders: {
      async createMany(input) {
        if (input.length === 0) {
          return [];
        }

        const docs = await OrderSummaryModel.insertMany(input);
        return docs.map(
          (doc) => toEntity(doc.toObject()) as OrderSummaryEntity,
        );
      },
      async list(filter = {}) {
        const docs = await OrderSummaryModel.find(filter)
          .sort({ createdAt: -1 })
          .lean();
        return docs.map((doc) => toEntity(doc) as OrderSummaryEntity);
      },
      async listPage(query = {}) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        const filter = toOrderSummaryMongoFilter(query);
        const sort = toOrderSummaryMongoSort(query.sort ?? "createdAt:desc");
        const [docs, total] = await Promise.all([
          OrderSummaryModel.find(filter)
            .sort(sort)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
          OrderSummaryModel.countDocuments(filter),
        ]);

        return {
          orders: docs.map((doc) => toEntity(doc) as OrderSummaryEntity),
          total,
          page,
          pageSize,
        };
      },
      async findById(id) {
        const doc = await OrderSummaryModel.findById(id).lean();
        return doc ? (toEntity(doc) as OrderSummaryEntity) : null;
      },
    },
    orderLines: {
      async createMany(input) {
        if (input.length === 0) {
          return [];
        }

        const docs = await OrderLineModel.insertMany(input);
        return docs.map((doc) => toEntity(doc.toObject()) as OrderLineEntity);
      },
      async findExistingRowFingerprints(candidates) {
        const uniqueCandidates = uniqueRowFingerprintCandidates(candidates);
        if (uniqueCandidates.length === 0) {
          return new Set();
        }

        const rowFingerprints = uniqueCandidates.map(
          (candidate) => candidate.rowFingerprint,
        );
        const docs = await OrderLineModel.find(
          { rowFingerprint: { $in: rowFingerprints } },
          { rowFingerprint: 1, _id: 0 },
        ).lean();

        const existingFingerprints = new Set(
          docs
            .map((doc) => doc.rowFingerprint)
            .filter(
              (rowFingerprint): rowFingerprint is string =>
                typeof rowFingerprint === "string",
            ),
        );

        const unmatchedCandidates = uniqueCandidates.filter(
          (candidate) => !existingFingerprints.has(candidate.rowFingerprint),
        );
        const legacyMatches = await findLegacyLineMatches(unmatchedCandidates);
        for (const rowFingerprint of legacyMatches) {
          existingFingerprints.add(rowFingerprint);
        }

        return existingFingerprints;
      },
      async list(filter = {}) {
        const docs = await OrderLineModel.find(filter)
          .sort({ rowNumber: 1 })
          .lean();
        return docs.map((doc) => toEntity(doc) as OrderLineEntity);
      },
      async count(filter = {}) {
        return OrderLineModel.countDocuments(filter);
      },
    },
  };
}

let defaultStore: DataStore | undefined;

export function getDefaultDataStore(): DataStore {
  if (!defaultStore) {
    defaultStore = createMongoDataStore();
  }

  return defaultStore;
}

const orderLineDeduplicationFields = [
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
] as const satisfies readonly (keyof OrderLineFields)[];

function uniqueRowFingerprintCandidates(
  candidates: OrderLineDeduplicationCandidate[],
): OrderLineDeduplicationCandidate[] {
  return [
    ...new Map(
      candidates.map((candidate) => [candidate.rowFingerprint, candidate]),
    ).values(),
  ];
}

async function findLegacyLineMatches(
  candidates: OrderLineDeduplicationCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) {
    return new Set();
  }

  const docs = await OrderLineModel.find(
    {
      $and: [
        {
          $or: [
            { rowFingerprint: { $exists: false } },
            { rowFingerprint: null },
          ],
        },
        {
          $or: candidates.map((candidate) =>
            toOrderLineExactMatchFilter(candidate.fields),
          ),
        },
      ],
    },
    Object.fromEntries(orderLineDeduplicationFields.map((field) => [field, 1])),
  ).lean();

  const legacyMatches = new Set<string>();
  for (const candidate of candidates) {
    if (docs.some((doc) => lineFieldsMatch(doc, candidate.fields))) {
      legacyMatches.add(candidate.rowFingerprint);
    }
  }

  return legacyMatches;
}

function toOrderLineExactMatchFilter(
  fields: OrderLineFields,
): Record<string, unknown> {
  return {
    $and: orderLineDeduplicationFields.map((field) => {
      const value = fields[field];
      if (value === undefined) {
        return {
          $or: [{ [field]: { $exists: false } }, { [field]: null }],
        };
      }

      return { [field]: value };
    }),
  };
}

function lineFieldsMatch(
  doc: Record<string, unknown>,
  fields: OrderLineFields,
): boolean {
  return orderLineDeduplicationFields.every((field) => {
    const expected = fields[field];
    const actual = doc[field];
    return expected === undefined ? actual == null : actual === expected;
  });
}

const orderSearchFields = [
  "sourceOrderId",
  "sourceOrderName",
  "customerEmail",
  "customerName",
  "shipCity",
  "shipCountry",
] as const;

const orderSorts: Record<OrderListSort, Record<string, 1 | -1>> = {
  "createdAt:desc": { createdAt: -1, _id: -1 },
  "createdAt:asc": { createdAt: 1, _id: 1 },
  "orderDate:desc": { orderDate: -1, _id: -1 },
  "orderDate:asc": { orderDate: 1, _id: 1 },
  "totalAmount:desc": { totalAmount: -1, _id: -1 },
  "totalAmount:asc": { totalAmount: 1, _id: 1 },
};

function toOrderSummaryMongoFilter(
  query: OrderSummaryListQuery,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  for (const field of [
    "importRunId",
    "salesChannel",
    "orderStatus",
    "paymentStatus",
    "fulfillmentStatus",
  ] as const) {
    if (query[field] !== undefined) {
      filter[field] = query[field];
    }
  }

  if (query.q !== undefined) {
    const search = new RegExp(escapeRegex(query.q), "i");
    filter.$or = orderSearchFields.map((field) => ({ [field]: search }));
  }

  const orderDateRange: Record<string, string> = {};
  if (query.dateFrom !== undefined) {
    orderDateRange.$gte = query.dateFrom;
  }
  if (query.dateTo !== undefined) {
    orderDateRange.$lte = query.dateTo;
  }
  if (Object.keys(orderDateRange).length > 0) {
    filter.orderDate = orderDateRange;
  }

  const totalRange: Record<string, number> = {};
  if (query.minTotal !== undefined) {
    totalRange.$gte = query.minTotal;
  }
  if (query.maxTotal !== undefined) {
    totalRange.$lte = query.maxTotal;
  }
  if (Object.keys(totalRange).length > 0) {
    filter.totalAmount = totalRange;
  }

  return filter;
}

function toOrderSummaryMongoSort(sort: OrderListSort): Record<string, 1 | -1> {
  return orderSorts[sort];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
