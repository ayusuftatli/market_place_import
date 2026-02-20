export type ConfigFormat = "yaml" | "json";
export type AcceptedFileKind = "csv" | "tsv" | "json" | "excel";
export type InputKind = "delimited" | "records";
export type ImportFileKind = AcceptedFileKind;

export type SourceRecord = Record<string, unknown>;

export interface TemplateSummary {
  key: string;
  label: string;
  description?: string;
  acceptedFileKinds: AcceptedFileKind[];
  sampleFileName: string;
  templateVersion: number;
  hasOverride: boolean;
}

export interface MarketplaceTemplate {
  key: string;
  label: string;
  description?: string;
  templateVersion: number;
  acceptedFileKinds: AcceptedFileKind[];
  sampleFileName: string;
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
    updatedAt: string;
  };
}

export interface RowValidationError {
  row: number;
  field?: string;
  message: string;
  value?: unknown;
}

export interface OrderSummary extends Record<string, unknown> {
  id?: string;
  importRunId?: string;
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
  createdAt?: string;
}

export interface OrderLine extends Record<string, unknown> {
  id?: string;
  orderId?: string;
  importRunId?: string;
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
  rowNumber?: number;
  createdAt?: string;
}

export type OrderListSort =
  | "createdAt:desc"
  | "createdAt:asc"
  | "orderDate:desc"
  | "orderDate:asc"
  | "totalAmount:desc"
  | "totalAmount:asc";

export interface OrderExplorerQuery {
  q?: string;
  importRunId?: string;
  salesChannel?: string;
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  minTotal?: number | string;
  maxTotal?: number | string;
  sort?: OrderListSort | "";
  page?: number | string;
  pageSize?: number | string;
}

export interface OrderListResponse {
  orders: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportRun {
  id: string;
  templateKey: string;
  templateVersion: number;
  fileName: string;
  inputKind: InputKind;
  sourceKind: "csv" | "tsv" | "json";
  mode: "preview" | "commit";
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  storedOrderCount: number;
  storedLineCount: number;
  errors: RowValidationError[];
  orderPreview: OrderSummary[];
  linePreview: OrderLine[];
  createdAt: string;
}

export interface ImportResult {
  importRunId: string;
  templateVersion: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  storedOrderCount: number;
  storedLineCount: number;
  errors: RowValidationError[];
  orderPreview: OrderSummary[];
  linePreview: OrderLine[];
}

export interface ImportDetail {
  import: ImportRun;
  orders: OrderSummary[];
}

export interface PreparedImportSource {
  kind: ImportFileKind;
  inputKind: InputKind;
  fileName: string;
  recordCount: number;
  content?: string;
  records?: SourceRecord[];
}

export interface ImportRequestPayload {
  templateKey: string;
  inputKind: InputKind;
  fileName: string;
  content?: string;
  records?: SourceRecord[];
}
