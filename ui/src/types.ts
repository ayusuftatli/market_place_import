export type Environment = "development" | "production";
export type SourceType = "csv" | "json";
export type ImportMode = "dry-run" | "commit";
export type ConfigStatus = "active" | "archived";
export type ConfigFormat = "yaml" | "json";
export type ImportFileKind = "csv" | "json" | "excel";

export type SourceRecord = Record<string, unknown>;

export interface Client {
  id: string;
  code: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportConfig {
  id: string;
  clientId: string;
  environment: Environment;
  version: number;
  status: ConfigStatus;
  format: ConfigFormat;
  config: {
    source?: {
      type?: SourceType;
      name?: string;
    };
    settings?: {
      allowPartialSuccess?: boolean;
      maxErrors?: number;
      previewLimit?: number;
    };
  };
  createdAt: string;
  promotedFromVersion?: number;
}

export interface RowValidationError {
  row: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface NormalizedOrder extends Record<string, unknown> {
  id?: string;
  batchId?: string;
  clientId?: string;
  externalOrderId: string;
  customerName?: string;
  customerEmail: string;
  orderTotal: number;
  currency: string;
  orderDate: string;
  status: string;
  sourceRecord?: SourceRecord;
  createdAt?: string;
}

export interface ImportResult {
  batchId: string;
  configVersion: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  storedOrderCount: number;
  errors: RowValidationError[];
  normalizedPreview: NormalizedOrder[];
}

export interface ImportBatch {
  id: string;
  clientId: string;
  client?: Client | null;
  environment: Environment;
  configId: string;
  configVersion: number;
  sourceType: SourceType;
  mode: ImportMode;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  storedRecords: number;
  errors: RowValidationError[];
  createdAt: string;
}

export interface PreparedImportSource {
  kind: ImportFileKind;
  fileName: string;
  sourceType: SourceType;
  recordCount: number;
  previewRows: SourceRecord[];
  csvContent?: string;
  records?: SourceRecord[];
}

export interface ImportRequestPayload {
  clientId: string;
  environment: Environment;
  configVersion?: number;
  sourceType: SourceType;
  csvContent?: string;
  records?: SourceRecord[];
}
