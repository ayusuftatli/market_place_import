export type Environment = "development" | "production";
export type SourceType = "csv" | "json";
export type ImportMode = "dry-run" | "commit";
export type ConfigStatus = "active" | "archived";
export type ConfigFormat = "yaml" | "json";

export type FieldType = "string" | "number" | "boolean" | "integer";

export interface FieldConfig {
  required?: boolean;
  type: FieldType;
  aliases?: string[];
  format?: string;
  pattern?: string;
  enum?: Array<string | number | boolean>;
  min?: number;
  max?: number;
}

export type TransformName =
  | "uppercase"
  | "lowercase"
  | "trim"
  | "default"
  | "source"
  | "enumMap"
  | "numberCoerce"
  | "dateNormalize";

export type TransformStep =
  | TransformName
  | {
      type: TransformName;
      value?: unknown;
      field?: string;
      map?: Record<string, unknown>;
      default?: unknown;
    };

export interface ImportTemplate {
  client?: string;
  environment: Environment;
  version?: number;
  source: {
    type: SourceType;
    name?: string;
  };
  fields: Record<string, FieldConfig>;
  transforms?: Record<string, TransformStep | TransformStep[]>;
  settings?: {
    allowPartialSuccess?: boolean;
    maxErrors?: number;
    previewLimit?: number;
  };
}

export interface RowValidationError {
  row: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface ClientEntity {
  id: string;
  code: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImportConfigEntity {
  id: string;
  clientId: string;
  environment: Environment;
  version: number;
  status: ConfigStatus;
  format: ConfigFormat;
  config: ImportTemplate;
  createdAt: Date;
  promotedFromVersion?: number;
}

export interface ImportBatchEntity {
  id: string;
  clientId: string;
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
  createdAt: Date;
}

export interface NormalizedOrderFields {
  externalOrderId: string;
  customerName?: string;
  customerEmail: string;
  orderTotal: number;
  currency: string;
  orderDate: string;
  status: string;
}

export interface NormalizedOrderEntity extends NormalizedOrderFields {
  id: string;
  batchId: string;
  clientId: string;
  sourceRecord: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateClientInput {
  code: string;
  name: string;
}

export interface CreateConfigInput {
  clientId: string;
  environment: Environment;
  version: number;
  status: ConfigStatus;
  format: ConfigFormat;
  config: ImportTemplate;
  promotedFromVersion?: number;
}

export interface CreateBatchInput {
  clientId: string;
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
}

export interface CreateOrderInput extends NormalizedOrderFields {
  batchId: string;
  clientId: string;
  sourceRecord: Record<string, unknown>;
}
