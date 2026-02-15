import { Types } from "mongoose";
import { ImportBatchModel } from "../batches/importBatchModel";
import { ClientModel } from "../clients/clientModel";
import { ImportConfigModel } from "../configs/importConfigModel";
import { NormalizedOrderModel } from "../orders/normalizedOrderModel";
import { conflict } from "./errors";
import type {
  ClientEntity,
  CreateBatchInput,
  CreateClientInput,
  CreateConfigInput,
  CreateOrderInput,
  Environment,
  ImportBatchEntity,
  ImportConfigEntity,
  NormalizedOrderEntity
} from "./types";

export interface ClientRepository {
  create(input: CreateClientInput): Promise<ClientEntity>;
  list(): Promise<ClientEntity[]>;
  findById(id: string): Promise<ClientEntity | null>;
  findByCode(code: string): Promise<ClientEntity | null>;
}

export interface ConfigRepository {
  create(input: CreateConfigInput): Promise<ImportConfigEntity>;
  list(filter?: {
    clientId?: string;
    environment?: Environment;
  }): Promise<ImportConfigEntity[]>;
  findById(id: string): Promise<ImportConfigEntity | null>;
  findLatest(
    clientId: string,
    environment: Environment
  ): Promise<ImportConfigEntity | null>;
  findByVersion(
    clientId: string,
    environment: Environment,
    version: number
  ): Promise<ImportConfigEntity | null>;
}

export interface BatchRepository {
  create(input: CreateBatchInput): Promise<ImportBatchEntity>;
  list(filter?: { clientId?: string }): Promise<ImportBatchEntity[]>;
  findById(id: string): Promise<ImportBatchEntity | null>;
}

export interface OrderRepository {
  createMany(input: CreateOrderInput[]): Promise<NormalizedOrderEntity[]>;
  list(filter?: { clientId?: string }): Promise<NormalizedOrderEntity[]>;
  findById(id: string): Promise<NormalizedOrderEntity | null>;
  count(filter?: { batchId?: string; clientId?: string }): Promise<number>;
}

export interface DataStore {
  clients: ClientRepository;
  configs: ConfigRepository;
  batches: BatchRepository;
  orders: OrderRepository;
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

export function createMemoryDataStore(): DataStore {
  let clients: ClientEntity[] = [];
  let configs: ImportConfigEntity[] = [];
  let batches: ImportBatchEntity[] = [];
  let orders: NormalizedOrderEntity[] = [];

  return {
    clients: {
      async create(input) {
        if (clients.some((client) => client.code === input.code)) {
          throw conflict(`Client code '${input.code}' already exists`);
        }

        const now = new Date();
        const client: ClientEntity = {
          id: newId(),
          code: input.code,
          name: input.name,
          createdAt: now,
          updatedAt: now
        };
        clients.push(client);
        return clone(client);
      },
      async list() {
        return clone([...clients].sort(byCreatedDesc));
      },
      async findById(id) {
        return clone(clients.find((client) => client.id === id) ?? null);
      },
      async findByCode(code) {
        return clone(clients.find((client) => client.code === code) ?? null);
      }
    },
    configs: {
      async create(input) {
        if (
          configs.some(
            (config) =>
              config.clientId === input.clientId &&
              config.environment === input.environment &&
              config.version === input.version
          )
        ) {
          throw conflict("Config version already exists for this client/environment");
        }

        const config: ImportConfigEntity = {
          id: newId(),
          createdAt: new Date(),
          ...input
        };
        configs.push(config);
        return clone(config);
      },
      async list(filter = {}) {
        return clone(
          configs
            .filter(
              (config) =>
                (!filter.clientId || config.clientId === filter.clientId) &&
                (!filter.environment || config.environment === filter.environment)
            )
            .sort((left, right) => {
              if (left.clientId !== right.clientId) {
                return left.clientId.localeCompare(right.clientId);
              }

              if (left.environment !== right.environment) {
                return left.environment.localeCompare(right.environment);
              }

              return right.version - left.version;
            })
        );
      },
      async findById(id) {
        return clone(configs.find((config) => config.id === id) ?? null);
      },
      async findLatest(clientId, environment) {
        return clone(
          configs
            .filter(
              (config) =>
                config.clientId === clientId && config.environment === environment
            )
            .sort((left, right) => right.version - left.version)[0] ?? null
        );
      },
      async findByVersion(clientId, environment, version) {
        return clone(
          configs.find(
            (config) =>
              config.clientId === clientId &&
              config.environment === environment &&
              config.version === version
          ) ?? null
        );
      }
    },
    batches: {
      async create(input) {
        const batch: ImportBatchEntity = {
          id: newId(),
          createdAt: new Date(),
          ...input
        };
        batches.push(batch);
        return clone(batch);
      },
      async list(filter = {}) {
        return clone(
          batches
            .filter((batch) => !filter.clientId || batch.clientId === filter.clientId)
            .sort(byCreatedDesc)
        );
      },
      async findById(id) {
        return clone(batches.find((batch) => batch.id === id) ?? null);
      }
    },
    orders: {
      async createMany(input) {
        const created = input.map<NormalizedOrderEntity>((order) => ({
          id: newId(),
          createdAt: new Date(),
          ...order
        }));
        orders.push(...created);
        return clone(created);
      },
      async list(filter = {}) {
        return clone(
          orders
            .filter((order) => !filter.clientId || order.clientId === filter.clientId)
            .sort(byCreatedDesc)
        );
      },
      async findById(id) {
        return clone(orders.find((order) => order.id === id) ?? null);
      },
      async count(filter = {}) {
        return orders.filter(
          (order) =>
            (!filter.batchId || order.batchId === filter.batchId) &&
            (!filter.clientId || order.clientId === filter.clientId)
        ).length;
      }
    },
    async reset() {
      clients = [];
      configs = [];
      batches = [];
      orders = [];
    }
  };
}

function toEntity<T extends { _id: unknown }>(doc: T): Omit<T, "_id"> & { id: string } {
  const { _id, ...rest } = doc;
  return {
    id: String(_id),
    ...rest
  } as Omit<T, "_id"> & { id: string };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export function createMongoDataStore(): DataStore {
  return {
    clients: {
      async create(input) {
        try {
          const doc = await ClientModel.create(input);
          return toEntity(doc.toObject()) as ClientEntity;
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw conflict(`Client code '${input.code}' already exists`);
          }
          throw error;
        }
      },
      async list() {
        const docs = await ClientModel.find().sort({ createdAt: -1 }).lean();
        return docs.map((doc) => toEntity(doc) as ClientEntity);
      },
      async findById(id) {
        const doc = await ClientModel.findById(id).lean();
        return doc ? (toEntity(doc) as ClientEntity) : null;
      },
      async findByCode(code) {
        const doc = await ClientModel.findOne({ code }).lean();
        return doc ? (toEntity(doc) as ClientEntity) : null;
      }
    },
    configs: {
      async create(input) {
        try {
          const doc = await ImportConfigModel.create(input);
          return toEntity(doc.toObject()) as ImportConfigEntity;
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            throw conflict("Config version already exists for this client/environment");
          }
          throw error;
        }
      },
      async list(filter = {}) {
        const docs = await ImportConfigModel.find(filter)
          .sort({ clientId: 1, environment: 1, version: -1 })
          .lean();
        return docs.map((doc) => toEntity(doc) as ImportConfigEntity);
      },
      async findById(id) {
        const doc = await ImportConfigModel.findById(id).lean();
        return doc ? (toEntity(doc) as ImportConfigEntity) : null;
      },
      async findLatest(clientId, environment) {
        const doc = await ImportConfigModel.findOne({ clientId, environment })
          .sort({ version: -1 })
          .lean();
        return doc ? (toEntity(doc) as ImportConfigEntity) : null;
      },
      async findByVersion(clientId, environment, version) {
        const doc = await ImportConfigModel.findOne({
          clientId,
          environment,
          version
        }).lean();
        return doc ? (toEntity(doc) as ImportConfigEntity) : null;
      }
    },
    batches: {
      async create(input) {
        const doc = await ImportBatchModel.create(input);
        return toEntity(doc.toObject()) as ImportBatchEntity;
      },
      async list(filter = {}) {
        const docs = await ImportBatchModel.find(filter).sort({ createdAt: -1 }).lean();
        return docs.map((doc) => toEntity(doc) as ImportBatchEntity);
      },
      async findById(id) {
        const doc = await ImportBatchModel.findById(id).lean();
        return doc ? (toEntity(doc) as ImportBatchEntity) : null;
      }
    },
    orders: {
      async createMany(input) {
        if (input.length === 0) {
          return [];
        }
        const docs = await NormalizedOrderModel.insertMany(input);
        return docs.map((doc) => toEntity(doc.toObject()) as NormalizedOrderEntity);
      },
      async list(filter = {}) {
        const docs = await NormalizedOrderModel.find(filter)
          .sort({ createdAt: -1 })
          .lean();
        return docs.map((doc) => toEntity(doc) as NormalizedOrderEntity);
      },
      async findById(id) {
        const doc = await NormalizedOrderModel.findById(id).lean();
        return doc ? (toEntity(doc) as NormalizedOrderEntity) : null;
      },
      async count(filter = {}) {
        return NormalizedOrderModel.countDocuments(filter);
      }
    }
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
