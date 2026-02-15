import { badRequest, notFound } from "../shared/errors";
import type { DataStore } from "../shared/dataStore";
import type {
  ConfigFormat,
  Environment,
  ImportConfigEntity,
  ImportTemplate
} from "../shared/types";

export async function createImportConfig(
  store: DataStore,
  input: {
    clientId: string;
    environment: Environment;
    format: ConfigFormat;
    config: ImportTemplate;
  }
): Promise<ImportConfigEntity> {
  const client = await store.clients.findById(input.clientId);
  if (!client) {
    throw notFound("Client not found");
  }

  if (input.config.environment !== input.environment) {
    throw badRequest("Config environment must match requested environment");
  }

  const latest = await store.configs.findLatest(input.clientId, input.environment);
  const version = latest ? latest.version + 1 : 1;

  return store.configs.create({
    clientId: input.clientId,
    environment: input.environment,
    version,
    status: "active",
    format: input.format,
    config: {
      ...input.config,
      version
    }
  });
}

export async function promoteImportConfig(
  store: DataStore,
  configId: string
): Promise<ImportConfigEntity> {
  const source = await store.configs.findById(configId);
  if (!source) {
    throw notFound("Config not found");
  }

  if (source.environment !== "development") {
    throw badRequest("Only development configs can be promoted");
  }

  const latestProduction = await store.configs.findLatest(
    source.clientId,
    "production"
  );
  const version = latestProduction ? latestProduction.version + 1 : 1;

  return store.configs.create({
    clientId: source.clientId,
    environment: "production",
    version,
    status: "active",
    format: source.format,
    promotedFromVersion: source.version,
    config: {
      ...source.config,
      environment: "production",
      version
    }
  });
}
