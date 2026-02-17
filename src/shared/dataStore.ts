import { Types } from "mongoose";
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
  OrderLineEntity,
  OrderSummaryEntity,
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
  findById(id: string): Promise<OrderSummaryEntity | null>;
}

export interface OrderLineRepository {
  createMany(input: CreateOrderLineInput[]): Promise<OrderLineEntity[]>;
  list(filter?: { importRunId?: string; orderId?: string }): Promise<OrderLineEntity[]>;
  count(filter?: { importRunId?: string; orderId?: string }): Promise<number>;
}

export interface DataStore {
  templateOverrides: TemplateOverrideRepository;
  importRuns: ImportRunRepository;
  orders: OrderSummaryRepository;
  orderLines: OrderLineRepository;
  reset?(): Promise<void>;
}

function newId(): string {
  return new Types.ObjectId().toString();
}

function byCreatedDesc<T extends { createdAt: Date }>(left: T, right: T): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toEntity<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return {
    id: String(_id),
    ...rest,
  } as Omit<T, "_id"> & { id: string };
}

export function createMemoryDataStore(): DataStore {
  let templateOverrides: TemplateOverrideEntity[] = [];
  let importRuns: ImportRunEntity[] = [];
  let orders: OrderSummaryEntity[] = [];
  let orderLines: OrderLineEntity[] = [];

  return {
    templateOverrides: {
      async list() {
        return new Map(
          templateOverrides.map((override) => [override.key, clone(override)]),
        );
      },
      async findByKey(key) {
        return clone(
          templateOverrides.find((override) => override.key === key) ?? null,
        );
      },
      async upsert(input) {
        const existing = templateOverrides.find((override) => override.key === input.key);
        const now = new Date();

        if (existing) {
          existing.format = input.format;
          existing.content = input.content;
          existing.template = clone(input.template);
          existing.templateVersion = input.templateVersion;
          existing.updatedAt = now;
          return clone(existing);
        }

        const created: TemplateOverrideEntity = {
          id: newId(),
          key: input.key,
          format: input.format,
          content: input.content,
          template: clone(input.template),
          templateVersion: input.templateVersion,
          createdAt: now,
          updatedAt: now,
        };
        templateOverrides.push(created);
        return clone(created);
      },
      async deleteByKey(key) {
        templateOverrides = templateOverrides.filter((override) => override.key !== key);
      },
    },
    importRuns: {
      async create(input) {
        const run: ImportRunEntity = {
          id: newId(),
          createdAt: new Date(),
          ...clone(input),
        };
        importRuns.push(run);
        return clone(run);
      },
      async list() {
        return clone([...importRuns].sort(byCreatedDesc));
      },
      async findById(id) {
        return clone(importRuns.find((run) => run.id === id) ?? null);
      },
    },
    orders: {
      async createMany(input) {
        const created = input.map<OrderSummaryEntity>((order) => ({
          id: newId(),
          createdAt: new Date(),
          ...clone(order),
        }));
        orders.push(...created);
        return clone(created);
      },
      async list(filter = {}) {
        return clone(
          orders
            .filter((order) => !filter.importRunId || order.importRunId === filter.importRunId)
            .sort(byCreatedDesc),
        );
      },
      async findById(id) {
        return clone(orders.find((order) => order.id === id) ?? null);
      },
    },
    orderLines: {
      async createMany(input) {
        const created = input.map<OrderLineEntity>((line) => ({
          id: newId(),
          createdAt: new Date(),
          ...clone(line),
        }));
        orderLines.push(...created);
        return clone(created);
      },
      async list(filter = {}) {
        return clone(
          orderLines
            .filter(
              (line) =>
                (!filter.importRunId || line.importRunId === filter.importRunId) &&
                (!filter.orderId || line.orderId === filter.orderId),
            )
            .sort((left, right) => left.rowNumber - right.rowNumber),
        );
      },
      async count(filter = {}) {
        return orderLines.filter(
          (line) =>
            (!filter.importRunId || line.importRunId === filter.importRunId) &&
            (!filter.orderId || line.orderId === filter.orderId),
        ).length;
      },
    },
    async reset() {
      templateOverrides = [];
      importRuns = [];
      orders = [];
      orderLines = [];
    },
  };
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
        return docs.map((doc) => toEntity(doc.toObject()) as OrderSummaryEntity);
      },
      async list(filter = {}) {
        const docs = await OrderSummaryModel.find(filter).sort({ createdAt: -1 }).lean();
        return docs.map((doc) => toEntity(doc) as OrderSummaryEntity);
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
      async list(filter = {}) {
        const docs = await OrderLineModel.find(filter).sort({ rowNumber: 1 }).lean();
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
    defaultStore =
      process.env.DATA_STORE === "memory"
        ? createMemoryDataStore()
        : createMongoDataStore();
  }

  return defaultStore;
}
