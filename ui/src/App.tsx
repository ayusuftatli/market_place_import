import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import {
  ApiClientError,
  buildImportRequest,
  commitImport,
  deleteTemplateOverride,
  getOrderLines,
  getTemplate,
  listOrders,
  listTemplates,
  previewImport,
  saveTemplateOverride,
} from "./api";
import {
  createDelimitedSource,
  createExcelSource,
  createRecordSource,
  downloadSampleExcel,
  parseJsonImport,
  prepareImportFile,
} from "./importFiles";
import type {
  ConfigFormat,
  ImportResult,
  OrderExplorerQuery,
  OrderLine,
  OrderListResponse,
  OrderListSort,
  OrderSummary,
  PreparedImportSource,
  RowValidationError,
  SourceRecord,
  TemplateDetail,
  TemplateSummary,
} from "./types";

const orderColumns = [
  "sourceOrderId",
  "salesChannel",
  "orderDate",
  "orderStatus",
  "totalAmount",
  "itemQuantity",
  "lineCount",
];

const lineColumns = [
  "sourceOrderId",
  "sku",
  "productTitle",
  "quantity",
  "unitPriceAmount",
  "lineSubtotalAmount",
  "lineTaxAmount",
  "lineDiscountAmount",
];

const storedOrderColumns = [
  "sourceOrderId",
  "sourceOrderName",
  "salesChannel",
  "orderDate",
  "orderStatus",
  "paymentStatus",
  "fulfillmentStatus",
  "customerName",
  "shipCity",
  "shipCountry",
  "totalAmount",
  "lineCount",
];

const orderSortOptions: { value: OrderListSort; label: string }[] = [
  { value: "createdAt:desc", label: "Newest stored" },
  { value: "createdAt:asc", label: "Oldest stored" },
  { value: "orderDate:desc", label: "Newest order date" },
  { value: "orderDate:asc", label: "Oldest order date" },
  { value: "totalAmount:desc", label: "Highest total" },
  { value: "totalAmount:asc", label: "Lowest total" },
];

const pageSizeOptions = [10, 25, 50, 100];

const sampleDataFiles = {
  amazon: "/data/amazon-orders-report.tsv",
  genericCsv: "/data/generic-marketplace-orders.csv",
  genericJson: "/data/generic-marketplace-orders.json",
  shopify: "/data/shopify-orders-export.csv",
} as const;

const defaultOrderQuery: OrderExplorerQuery = {
  sort: "createdAt:desc",
  page: 1,
  pageSize: 25,
};

const emptyOrderList: OrderListResponse = {
  orders: [],
  total: 0,
  page: 1,
  pageSize: 25,
};

type AppTab = "upload" | "explore";

export function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<AppTab>("upload");
  const [orderQuery, setOrderQuery] = useState<OrderExplorerQuery>(() => ({
    ...defaultOrderQuery,
  }));
  const [orderList, setOrderList] = useState<OrderListResponse>(() => ({
    ...emptyOrderList,
  }));
  const [selectedStoredOrderId, setSelectedStoredOrderId] = useState<
    string | null
  >(null);
  const [selectedStoredOrderLines, setSelectedStoredOrderLines] = useState<
    OrderLine[]
  >([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderLinesLoading, setOrderLinesLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selectedPreviewOrderId, setSelectedPreviewOrderId] = useState<
    string | null
  >(null);
  const [importSource, setImportSource] = useState<PreparedImportSource | null>(
    null,
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorFormat, setEditorFormat] = useState<ConfigFormat>("yaml");
  const [editorContent, setEditorContent] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orderRequestRef = useRef(0);
  const orderLineRequestRef = useRef(0);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.key === selectedTemplateKey),
    [selectedTemplateKey, templates],
  );
  const isBusy = loadingLabel.length > 0;

  const previewLines = useMemo(() => {
    if (!result) {
      return [];
    }

    if (!selectedPreviewOrderId) {
      return result.linePreview;
    }

    return result.linePreview.filter(
      (line) => line.sourceOrderId === selectedPreviewOrderId,
    );
  }, [result, selectedPreviewOrderId]);

  const selectedStoredOrder = useMemo(
    () => orderList.orders.find((order) => order.id === selectedStoredOrderId),
    [orderList.orders, selectedStoredOrderId],
  );

  const orderPageCount = Math.max(
    1,
    Math.ceil(orderList.total / orderList.pageSize),
  );
  const orderResultStart =
    orderList.total === 0 ? 0 : (orderList.page - 1) * orderList.pageSize + 1;
  const orderResultEnd = Math.min(
    orderList.page * orderList.pageSize,
    orderList.total,
  );
  const orderResultSummary =
    orderList.total === 0
      ? "No stored orders match these filters."
      : `Showing ${orderResultStart}-${orderResultEnd} of ${orderList.total} stored orders.`;

  useEffect(() => {
    void bootstrap();
    void refreshStoredOrderExplorer(orderQuery);
  }, []);

  useEffect(() => {
    if (!selectedTemplateKey) {
      return;
    }

    void loadTemplateDetail(selectedTemplateKey);
  }, [selectedTemplateKey]);

  async function bootstrap() {
    await runSafely("Loading portal", async () => {
      const nextTemplates = await listTemplates();

      setTemplates(nextTemplates);
      if (nextTemplates.length > 0) {
        setSelectedTemplateKey(nextTemplates[0].key);
      }
    });
  }

  async function loadTemplateDetail(key: string) {
    await runSafely("Loading template", async () => {
      const detail = await getTemplate(key);
      setTemplateDetail(detail);
      resetEditor(detail, detail.override?.format ?? "yaml");
    });
  }

  function resetEditor(detail: TemplateDetail, format: ConfigFormat) {
    setEditorFormat(format);
    setEditorContent(
      format === "yaml"
        ? (detail.override?.content ?? detail.builtInContent.yaml)
        : detail.override?.format === "json"
          ? detail.override.content
          : JSON.stringify(detail.template, null, 2),
    );
  }

  async function refreshStoredOrderExplorer(
    query: OrderExplorerQuery = orderQuery,
  ) {
    const requestId = orderRequestRef.current + 1;
    orderRequestRef.current = requestId;
    orderLineRequestRef.current += 1;
    setOrdersLoading(true);
    setOrderLinesLoading(false);
    setOrdersError("");

    try {
      const response = await listOrders(query);
      if (requestId !== orderRequestRef.current) {
        return;
      }

      setOrderList(response);
      const firstOrderId = response.orders[0]?.id ?? null;
      setSelectedStoredOrderId(firstOrderId);
      setSelectedStoredOrderLines([]);

      if (firstOrderId) {
        void loadStoredOrderLines(firstOrderId);
      }
    } catch (caught) {
      if (requestId === orderRequestRef.current) {
        setOrdersError(formatError(caught));
      }
    } finally {
      if (requestId === orderRequestRef.current) {
        setOrdersLoading(false);
      }
    }
  }

  async function loadStoredOrderLines(orderId: string) {
    const requestId = orderLineRequestRef.current + 1;
    orderLineRequestRef.current = requestId;
    setOrderLinesLoading(true);
    setOrdersError("");

    try {
      const lines = await getOrderLines(orderId);
      if (requestId === orderLineRequestRef.current) {
        setSelectedStoredOrderLines(lines);
      }
    } catch (caught) {
      if (requestId === orderLineRequestRef.current) {
        setOrdersError(formatError(caught));
      }
    } finally {
      if (requestId === orderLineRequestRef.current) {
        setOrderLinesLoading(false);
      }
    }
  }

  async function runSafely(label: string, task: () => Promise<void>) {
    setLoadingLabel(label);
    setError("");
    setMessage("");

    try {
      await task();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setLoadingLabel("");
    }
  }

  async function handleFileSelection(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }

    await runSafely("Reading file", async () => {
      const prepared = await prepareImportFile(file);
      setImportSource(prepared);
      setResult(null);
      setSelectedPreviewOrderId(null);
      setMessage(`${prepared.fileName} is ready.`);
    });
  }

  async function loadSample(
    kind:
      | "amazon"
      | "shopify"
      | "generic-csv"
      | "generic-json"
      | "generic-excel",
  ) {
    await runSafely("Loading sample", async () => {
      if (kind === "amazon") {
        setImportSource(
          createDelimitedSource(
            "amazon-orders-report.tsv",
            await fetchSampleText(sampleDataFiles.amazon),
            "tsv",
          ),
        );
        setSelectedTemplateKey("amazon");
        setResult(null);
        setMessage("Amazon sample loaded.");
        return;
      }

      if (kind === "shopify") {
        setImportSource(
          createDelimitedSource(
            "shopify-orders-export.csv",
            await fetchSampleText(sampleDataFiles.shopify),
            "csv",
          ),
        );
        setSelectedTemplateKey("shopify");
        setResult(null);
        setMessage("Shopify sample loaded.");
        return;
      }

      if (kind === "generic-json") {
        setImportSource(
          createRecordSource(
            "generic-marketplace-orders.json",
            await fetchSampleRecords(sampleDataFiles.genericJson),
            "json",
          ),
        );
        setSelectedTemplateKey("generic");
        setResult(null);
        setMessage("Generic JSON sample loaded.");
        return;
      }

      if (kind === "generic-excel") {
        setImportSource(
          createExcelSource(
            "generic-marketplace-orders.xlsx",
            await fetchSampleRecords(sampleDataFiles.genericJson),
          ),
        );
        setSelectedTemplateKey("generic");
        setResult(null);
        setMessage("Generic Excel sample loaded.");
        return;
      }

      setImportSource(
        createDelimitedSource(
          "generic-marketplace-orders.csv",
          await fetchSampleText(sampleDataFiles.genericCsv),
          "csv",
        ),
      );
      setSelectedTemplateKey("generic");
      setResult(null);
      setMessage("Generic CSV sample loaded.");
    });
  }

  async function handleDownloadSampleExcel() {
    await runSafely("Preparing Excel", async () => {
      downloadSampleExcel(
        await fetchSampleRecords(sampleDataFiles.genericJson),
      );
      setMessage("Generic Excel sample downloaded.");
    });
  }

  async function fetchSampleText(path: string): Promise<string> {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${path} (${response.status}).`);
    }

    return response.text();
  }

  async function fetchSampleRecords(path: string): Promise<SourceRecord[]> {
    return parseJsonImport(await fetchSampleText(path));
  }

  async function handleImport(mode: "preview" | "commit") {
    if (!selectedTemplateKey) {
      setError("Choose a source template first.");
      return;
    }

    if (!importSource) {
      setError("Load a source file first.");
      return;
    }

    await runSafely(
      mode === "preview" ? "Previewing import" : "Committing import",
      async () => {
        const payload = buildImportRequest({
          templateKey: selectedTemplateKey,
          source: importSource,
        });
        const output =
          mode === "preview"
            ? await previewImport(payload)
            : await commitImport(payload);

        setResult(output);
        setSelectedPreviewOrderId(
          output.orderPreview[0]?.sourceOrderId ?? null,
        );

        if (mode === "commit") {
          const nextQuery = {
            ...orderQuery,
            page: 1,
          };
          setOrderQuery(nextQuery);
          await refreshStoredOrderExplorer(nextQuery);
          setActiveTab("explore");
        }

        setMessage(
          mode === "preview"
            ? "Preview ready."
            : `${output.storedOrderCount} order summary record(s) stored.`,
        );
      },
    );
  }

  async function handleSelectStoredOrder(order: OrderSummary) {
    const orderId = order.id ?? null;
    setSelectedStoredOrderId(orderId);
    setSelectedStoredOrderLines([]);

    if (!orderId) {
      return;
    }

    await loadStoredOrderLines(orderId);
  }

  function handleOrderQueryChange(
    patch: Partial<OrderExplorerQuery>,
    resetPage = true,
  ) {
    const nextQuery = {
      ...orderQuery,
      ...patch,
      ...(resetPage && patch.page === undefined ? { page: 1 } : {}),
    };
    setOrderQuery(nextQuery);
    void refreshStoredOrderExplorer(nextQuery);
  }

  function handleClearOrderFilters() {
    const nextQuery = { ...defaultOrderQuery };
    setOrderQuery(nextQuery);
    void refreshStoredOrderExplorer(nextQuery);
  }

  async function handleSaveOverride() {
    if (!templateDetail) {
      return;
    }

    await runSafely("Saving template override", async () => {
      const detail = await saveTemplateOverride({
        key: templateDetail.template.key,
        format: editorFormat,
        content: editorContent,
      });
      setTemplateDetail(detail);
      resetEditor(detail, detail.override?.format ?? editorFormat);
      setTemplates(await listTemplates());
      setMessage("Advanced template override saved.");
    });
  }

  async function handleRestoreTemplate() {
    if (!templateDetail) {
      return;
    }

    await runSafely("Restoring built-in template", async () => {
      const detail = await deleteTemplateOverride(templateDetail.template.key);
      setTemplateDetail(detail);
      resetEditor(detail, "yaml");
      setTemplates(await listTemplates());
      setMessage("Built-in template restored.");
    });
  }

  function handleEditorFormatChange(format: ConfigFormat) {
    setEditorFormat(format);
    if (!templateDetail) {
      return;
    }

    setEditorContent(
      format === "yaml"
        ? YAML.stringify(templateDetail.template)
        : JSON.stringify(templateDetail.template, null, 2),
    );
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Marketplace Import Portal</p>
          <div className="status-strip" aria-live="polite">
            <span>{loadingLabel || message || "Ready"}</span>
            {error ? <strong className="error-text">{error}</strong> : null}
          </div>
        </div>
      </header>

      <nav className="tab-bar" role="tablist" aria-label="Portal workspace">
        <button
          id="upload-tab"
          role="tab"
          aria-selected={activeTab === "upload"}
          aria-controls="upload-panel"
          className={`tab-button ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          Upload
        </button>
        <button
          id="explore-tab"
          role="tab"
          aria-selected={activeTab === "explore"}
          aria-controls="explore-panel"
          className={`tab-button ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          Stored orders
        </button>
      </nav>

      {activeTab === "upload" ? (
        <div id="upload-panel" role="tabpanel" aria-labelledby="upload-tab">
          <section className="template-band">
            <div className="section-title">
              <div>
                <p className="eyebrow">Templates</p>
                <h2>Choose a source lane</h2>
              </div>
              <button
                className="ghost"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                {advancedOpen ? "Hide advanced" : "Advanced template editor"}
              </button>
            </div>
            <div className="template-grid">
              {templates.map((template) => (
                <button
                  key={template.key}
                  className={`template-card ${template.key === selectedTemplateKey ? "active" : ""}`}
                  onClick={() => setSelectedTemplateKey(template.key)}
                >
                  <strong>{template.label}</strong>
                  <span>{template.description}</span>
                  <small>
                    {template.acceptedFileKinds.join(", ")}
                    {template.hasOverride ? " • override active" : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>

          {advancedOpen && templateDetail ? (
            <section className="advanced-band">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Advanced</p>
                  <h2>{templateDetail.template.label}</h2>
                </div>
                <div className="button-row">
                  <label className="compact-label">
                    Format
                    <select
                      value={editorFormat}
                      onChange={(event) =>
                        handleEditorFormatChange(
                          event.target.value as ConfigFormat,
                        )
                      }
                    >
                      <option value="yaml">yaml</option>
                      <option value="json">json</option>
                    </select>
                  </label>
                  <button
                    className="ghost"
                    onClick={handleRestoreTemplate}
                    disabled={isBusy}
                  >
                    Restore built-in
                  </button>
                  <button
                    className="primary"
                    onClick={handleSaveOverride}
                    disabled={isBusy}
                  >
                    Save override
                  </button>
                </div>
              </div>
              <textarea
                className="editor"
                value={editorContent}
                onChange={(event) => setEditorContent(event.target.value)}
                spellCheck={false}
              />
            </section>
          ) : null}

          <section className="workspace">
            <div className="import-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Import</p>
                  <h2>Source file</h2>
                </div>
                <button
                  className="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  Choose file
                </button>
              </div>

              <div
                className="drop-zone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFileSelection(event.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".csv,.tsv,.json,.xls,.xlsx"
                  onChange={(event) =>
                    void handleFileSelection(event.target.files)
                  }
                />
                <strong>
                  {importSource
                    ? importSource.fileName
                    : "Drop a marketplace export"}
                </strong>
                <span>
                  {importSource
                    ? `${importSource.recordCount} source row(s) ready`
                    : selectedTemplate
                      ? `${selectedTemplate.acceptedFileKinds.join(", ")} supported`
                      : "Choose a template first"}
                </span>
              </div>

              <div className="button-row">
                <button onClick={() => void loadSample("amazon")}>
                  Amazon sample
                </button>
                <button onClick={() => void loadSample("shopify")}>
                  Shopify sample
                </button>
                <button onClick={() => void loadSample("generic-csv")}>
                  Generic CSV
                </button>
                <button onClick={() => void loadSample("generic-json")}>
                  Generic JSON
                </button>
                <button onClick={() => void loadSample("generic-excel")}>
                  Generic Excel
                </button>
                <button
                  className="ghost"
                  onClick={() => void handleDownloadSampleExcel()}
                >
                  Download Excel
                </button>
              </div>

              <div className="action-row">
                <button
                  className="primary"
                  onClick={() => void handleImport("preview")}
                  disabled={isBusy || !importSource || !selectedTemplateKey}
                >
                  Preview import
                </button>
                <button
                  className="success"
                  onClick={() => void handleImport("commit")}
                  disabled={isBusy || !importSource || !selectedTemplateKey}
                >
                  Commit valid rows
                </button>
              </div>
            </div>

            <div className="result-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Current run</p>
                  <h2>Validation and rollup</h2>
                </div>
                {result ? <StatusPill result={result} /> : null}
              </div>

              {result ? (
                <>
                  <div className="metric-grid">
                    <Metric label="Rows" value={result.totalRecords} />
                    <Metric
                      label="Valid"
                      value={result.validRecords}
                      tone="good"
                    />
                    <Metric
                      label="Invalid"
                      value={result.invalidRecords}
                      tone="bad"
                    />
                    <Metric label="Orders" value={result.orderPreview.length} />
                    <Metric label="Lines" value={result.linePreview.length} />
                    <Metric label="Stored" value={result.storedOrderCount} />
                  </div>

                  <h3>Row errors</h3>
                  <ErrorTable errors={result.errors} />

                  <h3>Order preview</h3>
                  <DataTable
                    rows={result.orderPreview}
                    columns={orderColumns}
                    emptyText="No clean orders in this preview."
                    getRowKey={(row) => String(row.sourceOrderId)}
                    activeRowKey={selectedPreviewOrderId ?? undefined}
                    onRowClick={(row) =>
                      setSelectedPreviewOrderId(String(row.sourceOrderId))
                    }
                  />

                  <h3>Line-item drill-down</h3>
                  <DataTable
                    rows={previewLines}
                    columns={lineColumns}
                    emptyText="Choose an order preview to inspect its lines."
                  />
                </>
              ) : (
                <EmptyState />
              )}
            </div>
          </section>
        </div>
      ) : (
        <section
          id="explore-panel"
          className="explorer-band"
          role="tabpanel"
          aria-labelledby="explore-tab"
        >
          <div className="section-title">
            <div>
              <p className="eyebrow">Stored orders</p>
              <h2>Explore MongoDB orders</h2>
            </div>
            <button
              className="ghost"
              onClick={() => void refreshStoredOrderExplorer(orderQuery)}
              disabled={ordersLoading}
            >
              Refresh
            </button>
          </div>

          <div className="explorer-controls">
            <label className="field-label wide">
              Search
              <input
                type="search"
                value={orderQuery.q ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ q: event.target.value })
                }
                placeholder="Order, customer, city, country"
              />
            </label>
            <label className="field-label">
              Channel
              <input
                value={orderQuery.salesChannel ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ salesChannel: event.target.value })
                }
                placeholder="Amazon.de"
              />
            </label>
            <label className="field-label">
              Order status
              <input
                value={orderQuery.orderStatus ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ orderStatus: event.target.value })
                }
                placeholder="paid"
              />
            </label>
            <label className="field-label">
              Payment status
              <input
                value={orderQuery.paymentStatus ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ paymentStatus: event.target.value })
                }
                placeholder="authorized"
              />
            </label>
            <label className="field-label">
              Fulfillment status
              <input
                value={orderQuery.fulfillmentStatus ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({
                    fulfillmentStatus: event.target.value,
                  })
                }
                placeholder="fulfilled"
              />
            </label>
            <label className="field-label">
              Date from
              <input
                type="date"
                value={orderQuery.dateFrom ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ dateFrom: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              Date to
              <input
                type="date"
                value={orderQuery.dateTo ?? ""}
                onChange={(event) =>
                  handleOrderQueryChange({ dateTo: event.target.value })
                }
              />
            </label>
            <label className="field-label">
              Min total
              <input
                type="number"
                step="0.01"
                value={String(orderQuery.minTotal ?? "")}
                onChange={(event) =>
                  handleOrderQueryChange({ minTotal: event.target.value })
                }
                placeholder="0.00"
              />
            </label>
            <label className="field-label">
              Max total
              <input
                type="number"
                step="0.01"
                value={String(orderQuery.maxTotal ?? "")}
                onChange={(event) =>
                  handleOrderQueryChange({ maxTotal: event.target.value })
                }
                placeholder="250.00"
              />
            </label>
            <label className="field-label">
              Sort
              <select
                value={orderQuery.sort || defaultOrderQuery.sort}
                onChange={(event) =>
                  handleOrderQueryChange({
                    sort: event.target.value as OrderListSort,
                  })
                }
              >
                {orderSortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Page size
              <select
                value={String(
                  orderQuery.pageSize ?? defaultOrderQuery.pageSize,
                )}
                onChange={(event) =>
                  handleOrderQueryChange({ pageSize: event.target.value })
                }
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost filter-reset"
              onClick={handleClearOrderFilters}
            >
              Clear filters
            </button>
          </div>

          {ordersError ? (
            <p className="inline-error" role="alert">
              {ordersError}
            </p>
          ) : null}

          <div className="explorer-summary">
            <p className="muted">
              {ordersLoading ? "Loading stored orders..." : orderResultSummary}
            </p>
            <div className="pagination-row">
              <button
                onClick={() =>
                  handleOrderQueryChange(
                    { page: Math.max(1, orderList.page - 1) },
                    false,
                  )
                }
                disabled={ordersLoading || orderList.page <= 1}
              >
                Previous
              </button>
              <span>
                Page {orderList.page} of {orderPageCount}
              </span>
              <button
                onClick={() =>
                  handleOrderQueryChange(
                    { page: Math.min(orderPageCount, orderList.page + 1) },
                    false,
                  )
                }
                disabled={ordersLoading || orderList.page >= orderPageCount}
              >
                Next
              </button>
            </div>
          </div>

          <div className="explorer-grid">
            <div className="explorer-table">
              <h3>Orders</h3>
              <DataTable
                rows={orderList.orders}
                columns={storedOrderColumns}
                emptyText={
                  ordersLoading
                    ? "Loading stored orders..."
                    : "No stored orders match these filters."
                }
                getRowKey={(row) =>
                  String((row as OrderSummary).id ?? row.sourceOrderId)
                }
                activeRowKey={selectedStoredOrderId ?? undefined}
                onRowClick={(row) =>
                  void handleSelectStoredOrder(row as OrderSummary)
                }
              />
            </div>

            <div className="line-detail">
              <h3>
                {selectedStoredOrder
                  ? `Line items for ${
                      selectedStoredOrder.sourceOrderName ??
                      selectedStoredOrder.sourceOrderId
                    }`
                  : "Line items"}
              </h3>
              <DataTable
                rows={selectedStoredOrderLines}
                columns={lineColumns}
                emptyText={
                  orderLinesLoading
                    ? "Loading line items..."
                    : selectedStoredOrderId
                      ? "No line items found for this order."
                      : "Choose a stored order to inspect its lines."
                }
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function StatusPill({ result }: { result: ImportResult }) {
  const tone = result.invalidRecords > 0 ? "warning" : "clean";

  return (
    <span className={`status-pill ${tone}`}>
      {result.invalidRecords > 0 ? "Needs review" : "Clean"}
    </span>
  );
}

function Metric(props: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  return (
    <div className={`metric ${props.tone ?? ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ErrorTable({ errors }: { errors: RowValidationError[] }) {
  if (errors.length === 0) {
    return <p className="muted">No validation errors.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Field</th>
            <th>Message</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error, index) => (
            <tr key={`${error.row}-${error.field ?? "row"}-${index}`}>
              <td>{error.row}</td>
              <td>{error.field ?? "record"}</td>
              <td>{error.message}</td>
              <td>{formatValue(error.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataTable(props: {
  rows: SourceRecord[];
  columns?: string[];
  emptyText: string;
  getRowKey?: (row: SourceRecord, rowIndex: number) => string;
  activeRowKey?: string;
  onRowClick?: (row: SourceRecord) => void;
}) {
  const columns = props.columns ?? inferColumns(props.rows);

  if (props.rows.length === 0 || columns.length === 0) {
    return <p className="muted">{props.emptyText}</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => {
            const rowKey = props.getRowKey?.(row, rowIndex) ?? String(rowIndex);
            const isActive = props.activeRowKey === rowKey;

            return (
              <tr
                key={rowKey}
                className={`${props.onRowClick ? "clickable-row" : ""} ${isActive ? "active-row" : ""}`}
                onClick={() => props.onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <td key={column}>{formatValue(row[column])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="eyebrow">Next step</p>
      <h3>Load a marketplace export and preview the rolled-up orders.</h3>
      <p>
        The portal will keep row-level validation errors, order summaries, and
        line-item detail together in one pass.
      </p>
    </div>
  );
}

function inferColumns(rows: SourceRecord[]): string[] {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
      if (columns.size >= 14) {
        return [...columns];
      }
    }
  }

  return [...columns];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : value;
}

function formatError(caught: unknown): string {
  if (caught instanceof ApiClientError) {
    return caught.message;
  }

  if (caught instanceof Error) {
    return caught.message;
  }

  return String(caught);
}
