import type {
  ConfigFormat,
  ImportDetail,
  ImportRequestPayload,
  ImportResult,
  ImportRun,
  OrderExplorerQuery,
  OrderLine,
  OrderListResponse,
  PreparedImportSource,
  TemplateDetail,
  TemplateSummary,
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
  templateKey: string;
  source: PreparedImportSource;
}): ImportRequestPayload {
  if (input.source.inputKind === "delimited") {
    return {
      templateKey: input.templateKey,
      inputKind: "delimited",
      fileName: input.source.fileName,
      content: input.source.content ?? "",
    };
  }

  return {
    templateKey: input.templateKey,
    inputKind: "records",
    fileName: input.source.fileName,
    records: input.source.records ?? [],
  };
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const response = await requestJson<{ templates: TemplateSummary[] }>("/templates");
  return response.templates;
}

export async function getTemplate(key: string): Promise<TemplateDetail> {
  return requestJson<TemplateDetail>(`/templates/${encodeURIComponent(key)}`);
}

export async function saveTemplateOverride(input: {
  key: string;
  format: ConfigFormat;
  content: string;
}): Promise<TemplateDetail> {
  return requestJson<TemplateDetail>(
    `/templates/${encodeURIComponent(input.key)}/override`,
    {
      method: "PUT",
      body: JSON.stringify({
        format: input.format,
        content: input.content,
      }),
    },
  );
}

export async function deleteTemplateOverride(key: string): Promise<TemplateDetail> {
  return requestJson<TemplateDetail>(`/templates/${encodeURIComponent(key)}/override`, {
    method: "DELETE",
  });
}

export async function previewImport(
  payload: ImportRequestPayload,
): Promise<ImportResult> {
  return requestJson<ImportResult>("/imports/preview", {
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

export async function listImports(): Promise<ImportRun[]> {
  const response = await requestJson<{ imports: ImportRun[] }>("/imports");
  return response.imports;
}

export async function getImport(id: string): Promise<ImportDetail> {
  return requestJson<ImportDetail>(`/imports/${encodeURIComponent(id)}`);
}

export async function listOrders(
  query: OrderExplorerQuery = {},
): Promise<OrderListResponse> {
  const queryString = buildOrderQueryString(query);
  return requestJson<OrderListResponse>(
    queryString.length > 0 ? `/orders?${queryString}` : "/orders",
  );
}

export async function getOrderLines(orderId: string): Promise<OrderLine[]> {
  const response = await requestJson<{ lines: OrderLine[] }>(
    `/orders/${encodeURIComponent(orderId)}/lines`,
  );
  return response.lines;
}

function buildOrderQueryString(query: OrderExplorerQuery): string {
  const params = new URLSearchParams();

  appendQueryValue(params, "q", query.q);
  appendQueryValue(params, "importRunId", query.importRunId);
  appendQueryValue(params, "salesChannel", query.salesChannel);
  appendQueryValue(params, "orderStatus", query.orderStatus);
  appendQueryValue(params, "paymentStatus", query.paymentStatus);
  appendQueryValue(params, "fulfillmentStatus", query.fulfillmentStatus);
  appendQueryValue(params, "dateFrom", query.dateFrom);
  appendQueryValue(params, "dateTo", query.dateTo);
  appendQueryValue(params, "minTotal", query.minTotal);
  appendQueryValue(params, "maxTotal", query.maxTotal);
  appendQueryValue(params, "sort", query.sort);
  appendQueryValue(params, "page", query.page);
  appendQueryValue(params, "pageSize", query.pageSize);

  return params.toString();
}

function appendQueryValue(
  params: URLSearchParams,
  key: string,
  value: number | string | undefined,
) {
  if (value === undefined) {
    return;
  }

  const serialized = String(value).trim();
  if (serialized.length === 0) {
    return;
  }

  params.set(key, serialized);
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
