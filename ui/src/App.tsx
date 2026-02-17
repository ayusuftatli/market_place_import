import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import {
  ApiClientError,
  buildImportRequest,
  commitImport,
  deleteTemplateOverride,
  getImport,
  getOrderLines,
  getTemplate,
  listImports,
  listTemplates,
  previewImport,
  saveTemplateOverride,
} from "./api";
import {
  AMAZON_SAMPLE_TSV,
  GENERIC_SAMPLE_CSV,
  GENERIC_SAMPLE_JSON,
  SHOPIFY_SAMPLE_CSV,
} from "./demoData";
import {
  createDelimitedSource,
  createExcelSource,
  createRecordSource,
  createSampleExcelWorkbook,
  downloadSampleExcel,
  parseExcelRecords,
  prepareImportFile,
} from "./importFiles";
import type {
  ConfigFormat,
  ImportDetail,
  ImportResult,
  ImportRun,
  OrderLine,
  OrderSummary,
  PreparedImportSource,
  RowValidationError,
  SourceRecord,
  TemplateDetail,
  TemplateSummary,
} from "./types";

const HEADER_IMAGE =
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80";

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

export function App() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateDetail, setTemplateDetail] = useState<TemplateDetail | null>(null);
  const [imports, setImports] = useState<ImportRun[]>([]);
  const [selectedImport, setSelectedImport] = useState<ImportDetail | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderLines, setSelectedOrderLines] = useState<OrderLine[]>([]);
  const [selectedPreviewOrderId, setSelectedPreviewOrderId] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<PreparedImportSource | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorFormat, setEditorFormat] = useState<ConfigFormat>("yaml");
  const [editorContent, setEditorContent] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const visibleHistoryOrders = useMemo(() => {
    if (!selectedImport) {
      return [];
    }

    if (selectedImport.orders.length > 0) {
      return selectedImport.orders;
    }

    return selectedImport.import.orderPreview;
  }, [selectedImport]);

  const visibleHistoryLines = useMemo(() => {
    if (!selectedImport) {
      return [];
    }

    if (selectedImport.orders.length > 0) {
      return selectedOrderLines;
    }

    if (!selectedOrderId) {
      return selectedImport.import.linePreview;
    }

    return selectedImport.import.linePreview.filter(
      (line) => line.sourceOrderId === selectedOrderId,
    );
  }, [selectedImport, selectedOrderId, selectedOrderLines]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedTemplateKey) {
      return;
    }

    void loadTemplateDetail(selectedTemplateKey);
  }, [selectedTemplateKey]);

  async function bootstrap() {
    await runSafely("Loading portal", async () => {
      const [nextTemplates, nextImports] = await Promise.all([
        listTemplates(),
        listImports(),
      ]);

      setTemplates(nextTemplates);
      setImports(nextImports);
      if (nextTemplates.length > 0) {
        setSelectedTemplateKey(nextTemplates[0].key);
      }
      if (nextImports.length > 0) {
        await openImportDetail(nextImports[0].id);
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
        ? detail.override?.content ?? detail.builtInContent.yaml
        : detail.override?.format === "json"
          ? detail.override.content
          : JSON.stringify(detail.template, null, 2),
    );
  }

  async function refreshImports(preferredImportId?: string) {
    const nextImports = await listImports();
    setImports(nextImports);

    const nextId =
      preferredImportId ?? selectedImport?.import.id ?? nextImports[0]?.id;

    if (nextId) {
      await openImportDetail(nextId);
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

  function loadSample(kind: "amazon" | "shopify" | "generic-csv" | "generic-json" | "generic-excel") {
    if (kind === "amazon") {
      setImportSource(
        createDelimitedSource("amazon-orders-report.tsv", AMAZON_SAMPLE_TSV, "tsv"),
      );
      setSelectedTemplateKey("amazon");
      setResult(null);
      setMessage("Amazon sample loaded.");
      return;
    }

    if (kind === "shopify") {
      setImportSource(
        createDelimitedSource("shopify-orders-export.csv", SHOPIFY_SAMPLE_CSV, "csv"),
      );
      setSelectedTemplateKey("shopify");
      setResult(null);
      setMessage("Shopify sample loaded.");
      return;
    }

    if (kind === "generic-json") {
      setImportSource(createRecordSource("generic-orders.json", GENERIC_SAMPLE_JSON, "json"));
      setSelectedTemplateKey("generic");
      setResult(null);
      setMessage("Generic JSON sample loaded.");
      return;
    }

    if (kind === "generic-excel") {
      setImportSource(
        createExcelSource(
          "generic-marketplace-orders.xlsx",
          parseExcelRecords(createSampleExcelWorkbook(GENERIC_SAMPLE_JSON)),
        ),
      );
      setSelectedTemplateKey("generic");
      setResult(null);
      setMessage("Generic Excel sample loaded.");
      return;
    }

    setImportSource(
      createDelimitedSource("generic-marketplace-orders.csv", GENERIC_SAMPLE_CSV, "csv"),
    );
    setSelectedTemplateKey("generic");
    setResult(null);
    setMessage("Generic CSV sample loaded.");
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

    await runSafely(mode === "preview" ? "Previewing import" : "Committing import", async () => {
      const payload = buildImportRequest({
        templateKey: selectedTemplateKey,
        source: importSource,
      });
      const output =
        mode === "preview"
          ? await previewImport(payload)
          : await commitImport(payload);

      setResult(output);
      setSelectedPreviewOrderId(output.orderPreview[0]?.sourceOrderId ?? null);
      await refreshImports(output.importRunId);
      setMessage(
        mode === "preview"
          ? "Preview ready."
          : `${output.storedOrderCount} order summary record(s) stored.`,
      );
    });
  }

  async function openImportDetail(importId: string) {
    const detail = await getImport(importId);
    setSelectedImport(detail);
    const firstOrderId = detail.orders[0]?.id ?? detail.import.orderPreview[0]?.sourceOrderId ?? null;
    setSelectedOrderId(firstOrderId);

    if (detail.orders[0]?.id) {
      const lines = await getOrderLines(detail.orders[0].id);
      setSelectedOrderLines(lines);
      return;
    }

    setSelectedOrderLines([]);
  }

  async function handleSelectImport(importId: string) {
    await runSafely("Loading import details", async () => {
      await openImportDetail(importId);
    });
  }

  async function handleSelectStoredOrder(order: OrderSummary) {
    setSelectedOrderId(order.id ?? order.sourceOrderId);

    if (!order.id) {
      setSelectedOrderLines([]);
      return;
    }

    await runSafely("Loading line items", async () => {
      const lines = await getOrderLines(order.id as string);
      setSelectedOrderLines(lines);
    });
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

  const historyLineLabel = selectedImport?.orders.length
    ? "Stored line items"
    : "Preview line items";

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Marketplace Import Portal</p>
          <h1>Review Amazon, Shopify, and spreadsheet exports before they land.</h1>
          <p>
            Choose a source, drop in the latest order file, and inspect clean
            order summaries with line-level drill-down.
          </p>
          <div className="status-strip" aria-live="polite">
            <span>{loadingLabel || message || "Ready"}</span>
            {error ? <strong className="error-text">{error}</strong> : null}
          </div>
        </div>
        <img className="masthead-image" src={HEADER_IMAGE} alt="Analyst reviewing order exports" />
      </header>

      <section className="template-band">
        <div className="section-title">
          <div>
            <p className="eyebrow">Templates</p>
            <h2>Choose a source lane</h2>
          </div>
          <button className="ghost" onClick={() => setAdvancedOpen((open) => !open)}>
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
                    handleEditorFormatChange(event.target.value as ConfigFormat)
                  }
                >
                  <option value="yaml">yaml</option>
                  <option value="json">json</option>
                </select>
              </label>
              <button className="ghost" onClick={handleRestoreTemplate} disabled={isBusy}>
                Restore built-in
              </button>
              <button className="primary" onClick={handleSaveOverride} disabled={isBusy}>
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
              onChange={(event) => void handleFileSelection(event.target.files)}
            />
            <strong>
              {importSource ? importSource.fileName : "Drop a marketplace export"}
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
            <button onClick={() => loadSample("amazon")}>Amazon sample</button>
            <button onClick={() => loadSample("shopify")}>Shopify sample</button>
            <button onClick={() => loadSample("generic-csv")}>Generic CSV</button>
            <button onClick={() => loadSample("generic-json")}>Generic JSON</button>
            <button onClick={() => loadSample("generic-excel")}>Generic Excel</button>
            <button className="ghost" onClick={() => downloadSampleExcel()}>
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

          <div className="preview-block">
            <h3>Source preview</h3>
            <DataTable
              rows={importSource?.previewRows ?? []}
              emptyText="Load a file to preview the first rows."
            />
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
                <Metric label="Valid" value={result.validRecords} tone="good" />
                <Metric label="Invalid" value={result.invalidRecords} tone="bad" />
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

      <section className="history-band">
        <div className="section-title">
          <div>
            <p className="eyebrow">Recent imports</p>
            <h2>History and stored orders</h2>
          </div>
        </div>

        <div className="history-grid">
          <div className="history-list">
            {imports.length === 0 ? (
              <p className="muted">No imports yet.</p>
            ) : (
              imports.map((item) => (
                <button
                  key={item.id}
                  className={`history-row ${selectedImport?.import.id === item.id ? "active" : ""}`}
                  onClick={() => void handleSelectImport(item.id)}
                >
                  <strong>{item.templateKey}</strong>
                  <span>{item.mode}</span>
                  <span>
                    {item.validRecords}/{item.totalRecords} valid
                  </span>
                  <small>{formatDate(item.createdAt)}</small>
                </button>
              ))
            )}
          </div>

          <div className="history-detail">
            {selectedImport ? (
              <>
                <div className="metric-grid compact">
                  <Metric label="Rows" value={selectedImport.import.totalRecords} />
                  <Metric label="Valid" value={selectedImport.import.validRecords} />
                  <Metric label="Invalid" value={selectedImport.import.invalidRecords} />
                  <Metric label="Stored orders" value={selectedImport.import.storedOrderCount} />
                  <Metric label="Stored lines" value={selectedImport.import.storedLineCount} />
                </div>

                <h3>Orders</h3>
                <DataTable
                  rows={visibleHistoryOrders}
                  columns={orderColumns}
                  emptyText="No orders for this import yet."
                  getRowKey={(row) =>
                    String((row as OrderSummary).id ?? row.sourceOrderId)
                  }
                  activeRowKey={selectedOrderId ?? undefined}
                  onRowClick={(row) => void handleSelectStoredOrder(row as OrderSummary)}
                />

                <h3>{historyLineLabel}</h3>
                <DataTable
                  rows={visibleHistoryLines}
                  columns={lineColumns}
                  emptyText="Choose an order to inspect its lines."
                />

                <h3>Validation errors</h3>
                <ErrorTable errors={selectedImport.import.errors} />
              </>
            ) : (
              <p className="muted">Run an import to build up history.</p>
            )}
          </div>
        </div>
      </section>
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
            const rowKey =
              props.getRowKey?.(row, rowIndex) ?? String(rowIndex);
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
