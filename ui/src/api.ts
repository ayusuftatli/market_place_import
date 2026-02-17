import type {
  Client,
  ConfigFormat,
  Environment,
  ImportBatch,
  ImportConfig,
  ImportRequestPayload,
  ImportResult,
  NormalizedOrder,
  PreparedImportSource,
} from "./types";

interface ApiErrorBody {
  error?: {
    message?: string;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function buildImportRequest(input: {
  clientId: string;
  environment: Environment;
  configVersion?: number;
  source: PreparedImportSource;
}): ImportRequestPayload {
  const base = {
    clientId: input.clientId,
    environment: input.environment,
    ...(input.configVersion !== undefined
      ? { configVersion: input.configVersion }
      : {}),
  };

  if (input.source.sourceType === "csv") {
    return {
      ...base,
      sourceType: "csv",
      csvContent: input.source.csvContent ?? "",
    };
  }

  return {
    ...base,
    sourceType: "json",
    records: input.source.records ?? [],
  };
}

export async function listClients(): Promise<Client[]> {
  const response = await requestJson<{ clients: Client[] }>("/clients");
  return response.clients;
}

export async function createClient(input: {
  code: string;
  name: string;
}): Promise<Client> {
  return requestJson<Client>("/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listConfigs(
  input: {
    clientId?: string;
    environment?: Environment;
  } = {},
): Promise<ImportConfig[]> {
  const params = new URLSearchParams();
  if (input.clientId) {
    params.set("clientId", input.clientId);
  }
  if (input.environment) {
    params.set("environment", input.environment);
  }

  const query = params.toString();
  const response = await requestJson<{ configs: ImportConfig[] }>(
    `/configs${query ? `?${query}` : ""}`,
  );
  return response.configs;
}

export async function uploadConfig(input: {
  clientId: string;
  environment: Environment;
  format: ConfigFormat;
  content: string;
}): Promise<ImportConfig> {
  return requestJson<ImportConfig>("/configs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function promoteConfig(id: string): Promise<ImportConfig> {
  return requestJson<ImportConfig>(`/configs/${id}/promote`, {
    method: "POST",
  });
}

export async function dryRunImport(
  payload: ImportRequestPayload,
): Promise<ImportResult> {
  return requestJson<ImportResult>("/imports/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function commitImport(
  payload: ImportRequestPayload,
): Promise<ImportResult> {
  return requestJson<ImportResult>("/imports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBatches(clientId?: string): Promise<ImportBatch[]> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await requestJson<{ batches: ImportBatch[] }>(
    `/batches${query}`,
  );
  return response.batches;
}

export async function getBatch(id: string): Promise<ImportBatch> {
  return requestJson<ImportBatch>(`/batches/${id}`);
}

export async function listOrders(
  clientId?: string,
): Promise<NormalizedOrder[]> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await requestJson<{ orders: NormalizedOrder[] }>(
    `/orders${query}`,
  );
  return response.orders;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = parseResponseBody(text);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody;
    throw new ApiClientError(
      response.status,
      errorBody.error?.message ?? `Request failed with ${response.status}`,
      errorBody.error?.details,
    );
  }

  return body as T;
}

function parseResponseBody(text: string): unknown {
  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getApiBaseUrl(): string {
  const env = import.meta.env as { VITE_API_BASE_URL?: string };
  return env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
}
