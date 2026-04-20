export type InputKind = "delimited" | "records";
export type SourceKind = "csv" | "tsv" | "json";
export type ImportMode = "preview" | "commit";
export type ConfigFormat = "yaml" | "json";
export type AcceptedFileKind = "csv" | "tsv" | "json" | "excel";

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

export type RollupAggregate = "first" | "firstNonEmpty" | "sum" | "count";

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

export interface RollupFieldConfig extends Omit<FieldConfig, "aliases"> {
  fromLineField?: string;
  aggregate?: RollupAggregate;
  value?: unknown;
}

export interface MarketplaceTemplate {
  key: string;
  label: string;
  description?: string;
  templateVersion: number;
  acceptedFileKinds: AcceptedFileKind[];
  sampleFileName: string;
  preprocessing?: {
    carryForwardSourceFields?: string[];
  };
  lineFields: Record<string, FieldConfig>;
  transforms?: Record<string, TransformStep | TransformStep[]>;
  orderRollup: {
    keyField: string;
    fields: Record<string, RollupFieldConfig>;
  };
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

export interface TemplateOverrideEntity {
  id: string;
  key: string;
  format: ConfigFormat;
  content: string;
  template: MarketplaceTemplate;
  templateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderSummaryFields {
  sourceOrderId: string;
  sourceOrderName?: string;
  salesChannel: string;
  orderDate: string;
  orderStatus: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  itemQuantity: number;
  lineCount: number;
  customerEmail?: string;
  customerName?: string;
  shipCity?: string;
  shipCountry?: string;
}

export interface OrderLineFields {
  sourceOrderId: string;
  sourceLineId?: string;
  salesChannel: string;
  sku?: string;
  asin?: string;
  productTitle: string;
  variantTitle?: string;
  quantity: number;
  unitPriceAmount: number;
  lineSubtotalAmount: number;
  lineTaxAmount: number;
  lineDiscountAmount: number;
  currency: string;
  lineStatus?: string;
}

export interface OrderSummaryEntity extends OrderSummaryFields {
  id: string;
  importRunId: string;
  createdAt: Date;
}

export interface OrderLineEntity extends OrderLineFields {
  id: string;
  importRunId: string;
  orderId: string;
  rowFingerprint: string;
  sourceRecord: Record<string, unknown>;
  rowNumber: number;
  createdAt: Date;
}

export type OrderListSort =
  | "createdAt:desc"
  | "createdAt:asc"
  | "orderDate:desc"
  | "orderDate:asc"
  | "totalAmount:desc"
  | "totalAmount:asc";

export interface OrderSummaryListQuery {
  q?: string;
  importRunId?: string;
  salesChannel?: string;
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  minTotal?: number;
  maxTotal?: number;
  sort?: OrderListSort;
  page?: number;
  pageSize?: number;
}

export interface OrderSummaryListResult {
  orders: OrderSummaryEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportRunEntity {
  id: string;
  templateKey: string;
  templateVersion: number;
  fileName: string;
  inputKind: InputKind;
  sourceKind: SourceKind;
  mode: ImportMode;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  storedOrderCount: number;
  storedLineCount: number;
  errors: RowValidationError[];
  orderPreview: OrderSummaryFields[];
  linePreview: OrderLineFields[];
  createdAt: Date;
}

export interface TemplateSummary {
  key: string;
  label: string;
  description?: string;
  acceptedFileKinds: AcceptedFileKind[];
  sampleFileName: string;
  templateVersion: number;
  hasOverride: boolean;
}

export interface TemplateDetail {
  template: MarketplaceTemplate;
  builtInContent: {
    yaml: string;
    json: string;
  };
  override: null | {
    format: ConfigFormat;
    content: string;
    templateVersion: number;
    updatedAt: Date;
  };
}

export interface ParsedSourceInput {
  sourceKind: SourceKind;
  records: Array<Record<string, unknown>>;
}

export interface CreateTemplateOverrideInput {
  key: string;
  format: ConfigFormat;
  content: string;
  template: MarketplaceTemplate;
  templateVersion: number;
}

export interface CreateImportRunInput {
  templateKey: string;
  templateVersion: number;
  fileName: string;
  inputKind: InputKind;
  sourceKind: SourceKind;
  mode: ImportMode;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  storedOrderCount: number;
  storedLineCount: number;
  errors: RowValidationError[];
  orderPreview: OrderSummaryFields[];
  linePreview: OrderLineFields[];
}

export interface CreateOrderSummaryInput extends OrderSummaryFields {
  importRunId: string;
}

export interface CreateOrderLineInput extends OrderLineFields {
  importRunId: string;
  orderId: string;
  rowFingerprint: string;
  sourceRecord: Record<string, unknown>;
  rowNumber: number;
}

export interface ImportRequestInput {
  templateKey: string;
  inputKind: InputKind;
  fileName: string;
  content?: unknown;
  records?: unknown;
}

export interface ImportPipelineResult {
  importRunId: string;
  templateVersion: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  storedOrderCount: number;
  storedLineCount: number;
  errors: RowValidationError[];
  orderPreview: OrderSummaryFields[];
  linePreview: OrderLineFields[];
}
