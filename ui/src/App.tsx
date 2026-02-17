import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError,
  buildImportRequest,
  commitImport,
  createClient,
  dryRunImport,
  getBatch,
  listBatches,
  listClients,
  listConfigs,
  listOrders,
  promoteConfig,
  uploadConfig,
} from "./api";
import {
  DEMO_CLIENT_CODE,
  DEMO_CLIENT_NAME,
  DEMO_CONFIG_YAML,
  DEMO_CSV,
  DEMO_JSON_RECORDS,
} from "./demoData";
import {
  createCsvSource,
  createExcelSource,
  createJsonSource,
  createSampleExcelWorkbook,
  downloadSampleExcel,
  parseExcelRecords,
  prepareImportFile,
} from "./importFiles";
import type {
  Client,
  ConfigFormat,
  Environment,
  ImportBatch,
  ImportConfig,
  ImportResult,
  NormalizedOrder,
  PreparedImportSource,
  RowValidationError,
  SourceRecord,
} from "./types";

const HEADER_IMAGE =
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=360&q=70";

const normalizedOrderColumns = [
  "externalOrderId",
  "customerEmail",
  "customerName",
  "orderTotal",
  "currency",
  "orderDate",
  "status",
];

const orderColumns = [
  "externalOrderId",
  "customerEmail",
  "orderTotal",
  "currency",
  "status",
  "batchId",
];

export function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [configs, setConfigs] = useState<ImportConfig[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [orders, setOrders] = useState<NormalizedOrder[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [environment, setEnvironment] = useState<Environment>("development");
  const [configVersion, setConfigVersion] = useState("latest");
  const [configContent, setConfigContent] = useState(DEMO_CONFIG_YAML);
  const [configFormat, setConfigFormat] = useState<ConfigFormat>("yaml");
  const [newClientCode, setNewClientCode] = useState("new-store");
  const [newClientName, setNewClientName] = useState("New Store");
  const [importSource, setImportSource] = useState<PreparedImportSource | null>(
    null,
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [activePanel, setActivePanel] = useState<"setup" | "history">("setup");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId),
    [clients, selectedClientId],
  );

  const environmentConfigs = useMemo(
    () =>
      configs.filter(
        (config) =>
          config.clientId === selectedClientId &&
          config.environment === environment,
      ),
    [configs, environment, selectedClientId],
  );

  const selectedConfigVersion = useMemo(() => {
    if (configVersion === "latest") {
      return undefined;
    }

    const parsed = Number(configVersion);
    return Number.isInteger(parsed) ? parsed : undefined;
  }, [configVersion]);

  const latestConfig = environmentConfigs[0];
  const isBusy = loadingLabel.length > 0;

  useEffect(() => {
    void loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setConfigs([]);
      setBatches([]);
      setOrders([]);
      return;
    }

    void refreshWorkspace(selectedClientId, environment);
  }, [environment, selectedClientId]);

  async function loadClients(preferredClientId?: string) {
    const nextClients = await listClients();
    setClients(nextClients);

    if (preferredClientId) {
      setSelectedClientId(preferredClientId);
      return;
    }

    if (!selectedClientId && nextClients.length > 0) {
      setSelectedClientId(nextClients[0].id);
    }
  }

  async function refreshWorkspace(
    clientId = selectedClientId,
    env = environment,
  ) {
    if (!clientId) {
      return;
    }

    const [nextConfigs, nextBatches, nextOrders] = await Promise.all([
      listConfigs({ clientId, environment: env }),
      listBatches(clientId),
      listOrders(clientId),
    ]);
    setConfigs(nextConfigs);
    setBatches(nextBatches);
    setOrders(nextOrders);

    if (
      configVersion !== "latest" &&
      !nextConfigs.some((config) => String(config.version) === configVersion)
    ) {
      setConfigVersion("latest");
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

  async function handleDemoSetup() {
    await runSafely("Preparing demo", async () => {
      const nextClients = await listClients();
      let demoClient = nextClients.find(
        (client) => client.code === DEMO_CLIENT_CODE,
      );

      if (!demoClient) {
        demoClient = await createClient({
          code: DEMO_CLIENT_CODE,
          name: DEMO_CLIENT_NAME,
        });
      }

      const existingConfigs = await listConfigs({
        clientId: demoClient.id,
        environment: "development",
      });

      if (existingConfigs.length === 0) {
        await uploadConfig({
          clientId: demoClient.id,
          environment: "development",
          format: "yaml",
          content: DEMO_CONFIG_YAML,
        });
      }

      setEnvironment("development");
      setConfigContent(DEMO_CONFIG_YAML);
      setConfigFormat("yaml");
      setConfigVersion("latest");
      setImportSource(createCsvSource("urban-home-orders.csv", DEMO_CSV));
      setResult(null);
      setActivePanel("setup");
      await loadClients(demoClient.id);
      await refreshWorkspace(demoClient.id, "development");
      setMessage("Demo workspace ready.");
    });
  }

  async function handleCreateClient() {
    await runSafely("Creating client", async () => {
      const client = await createClient({
        code: newClientCode.trim(),
        name: newClientName.trim(),
      });
      await loadClients(client.id);
      setMessage("Client created.");
    });
  }

  async function handleUploadConfig() {
    if (!selectedClientId) {
      setError("Choose a client before uploading a config.");
      return;
    }

    await runSafely("Uploading config", async () => {
      const config = await uploadConfig({
        clientId: selectedClientId,
        environment,
        format: configFormat,
        content: configContent,
      });
      setConfigVersion(String(config.version));
      await refreshWorkspace(selectedClientId, environment);
      setMessage(`Config version ${config.version} uploaded.`);
    });
  }

  async function handlePromoteConfig(configId: string) {
    await runSafely("Promoting config", async () => {
      await promoteConfig(configId);
      await refreshWorkspace(selectedClientId, environment);
      setMessage("Config promoted to production.");
    });
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
      setMessage(`${prepared.fileName} ready for import.`);
    });
  }

  function loadSampleCsv() {
    setImportSource(createCsvSource("urban-home-orders.csv", DEMO_CSV));
    setResult(null);
    setMessage("Sample CSV loaded.");
  }

  function loadSampleJson() {
    setImportSource(
      createJsonSource("urban-home-orders.json", DEMO_JSON_RECORDS),
    );
    setResult(null);
    setMessage("Sample JSON loaded.");
  }

  function loadSampleExcel() {
    const records = parseExcelRecords(createSampleExcelWorkbook());
    setImportSource(createExcelSource("urban-home-orders.xlsx", records));
    setResult(null);
    setMessage("Sample Excel workbook loaded.");
  }

  async function handleImport(mode: "dry-run" | "commit") {
    if (!selectedClientId) {
      setError("Choose or create a client first.");
      return;
    }

    if (!importSource) {
      setError("Load a CSV, JSON, or Excel file first.");
      return;
    }

    await runSafely(
      mode === "dry-run" ? "Running dry-run" : "Committing",
      async () => {
        const payload = buildImportRequest({
          clientId: selectedClientId,
          environment,
          configVersion: selectedConfigVersion,
          source: importSource,
        });
        const output =
          mode === "dry-run"
            ? await dryRunImport(payload)
            : await commitImport(payload);

        setResult(output);
        await refreshWorkspace(selectedClientId, environment);
        setMessage(
          mode === "dry-run"
            ? "Dry-run complete."
            : `${output.storedOrderCount} order record(s) stored.`,
        );
      },
    );
  }

  async function handleSelectBatch(batchId: string) {
    await runSafely("Loading batch", async () => {
      const batch = await getBatch(batchId);
      setSelectedBatch(batch);
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-copy">
          <p className="eyebrow">Order Import Platform</p>
          <h1>Import console</h1>
          <p>
            Preview partner files, catch row errors, and commit clean normalized
            orders.
          </p>
        </div>
        <img
          className="brand-image"
          src={HEADER_IMAGE}
          alt="Spreadsheet review workspace"
        />
      </header>

      <section className="toolbar" aria-label="Workspace controls">
        <button className="primary" onClick={handleDemoSetup} disabled={isBusy}>
          One-click demo setup
        </button>
        <label>
          Client
          <select
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
          >
            <option value="">Choose client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Environment
          <select
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as Environment)
            }
          >
            <option value="development">development</option>
            <option value="production">production</option>
          </select>
        </label>
        <label>
          Config
          <select
            value={configVersion}
            onChange={(event) => setConfigVersion(event.target.value)}
            disabled={environmentConfigs.length === 0}
          >
            <option value="latest">Latest active</option>
            {environmentConfigs.map((config) => (
              <option key={config.id} value={config.version}>
                v{config.version} {config.status}
              </option>
            ))}
          </select>
        </label>
      </section>

      <StatusBar
        loadingLabel={loadingLabel}
        message={message}
        error={error}
        selectedClient={selectedClient}
        latestConfig={latestConfig}
      />

      <section className="workspace">
        <div className="import-panel">
          <div className="section-heading">
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
              accept=".csv,.json,.xls,.xlsx"
              onChange={(event) => void handleFileSelection(event.target.files)}
            />
            <strong>
              {importSource
                ? importSource.fileName
                : "Drop a CSV, JSON, or Excel file"}
            </strong>
            <span>
              {importSource
                ? `${importSource.recordCount} source row(s) ready`
                : "Excel is converted in the browser before it reaches the API."}
            </span>
          </div>

          <div className="button-row">
            <button onClick={loadSampleCsv}>Load sample CSV</button>
            <button onClick={loadSampleJson}>Load sample JSON</button>
            <button onClick={loadSampleExcel}>Load sample Excel</button>
            <button className="ghost" onClick={downloadSampleExcel}>
              Download Excel
            </button>
          </div>

          <div className="action-row">
            <button
              className="primary"
              onClick={() => void handleImport("dry-run")}
              disabled={isBusy || !importSource || !selectedClientId}
            >
              Dry-run import
            </button>
            <button
              className="success"
              onClick={() => void handleImport("commit")}
              disabled={isBusy || !importSource || !selectedClientId}
            >
              Commit valid rows
            </button>
          </div>

          <SourcePreview source={importSource} />
        </div>

        <div className="result-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Result</p>
              <h2>Validation</h2>
            </div>
            {result ? <StatusPill result={result} /> : null}
          </div>

          {result ? (
            <>
              <div className="metric-grid">
                <Metric label="Total" value={result.totalRecords} />
                <Metric label="Valid" value={result.validRecords} tone="good" />
                <Metric
                  label="Invalid"
                  value={result.invalidRecords}
                  tone="bad"
                />
                <Metric label="Stored" value={result.storedOrderCount} />
              </div>

              <h3>Row errors</h3>
              <ErrorTable errors={result.errors} />

              <h3>Normalized preview</h3>
              <DataTable
                rows={result.normalizedPreview}
                columns={normalizedOrderColumns}
                emptyText="No valid rows in this preview."
              />
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </section>

      <section className="secondary">
        <div className="tabs" role="tablist" aria-label="Secondary panels">
          <button
            className={activePanel === "setup" ? "active" : ""}
            onClick={() => setActivePanel("setup")}
          >
            Clients and configs
          </button>
          <button
            className={activePanel === "history" ? "active" : ""}
            onClick={() => setActivePanel("history")}
          >
            History and orders
          </button>
        </div>

        {activePanel === "setup" ? (
          <SetupPanel
            configContent={configContent}
            configFormat={configFormat}
            configs={environmentConfigs}
            isBusy={isBusy}
            newClientCode={newClientCode}
            newClientName={newClientName}
            selectedClientId={selectedClientId}
            onClientCodeChange={setNewClientCode}
            onClientNameChange={setNewClientName}
            onConfigContentChange={setConfigContent}
            onConfigFormatChange={setConfigFormat}
            onCreateClient={() => void handleCreateClient()}
            onLoadDemoConfig={() => {
              setConfigFormat("yaml");
              setConfigContent(DEMO_CONFIG_YAML);
            }}
            onPromoteConfig={(id) => void handlePromoteConfig(id)}
            onUploadConfig={() => void handleUploadConfig()}
          />
        ) : (
          <HistoryPanel
            batches={batches}
            orders={orders}
            selectedBatch={selectedBatch}
            onSelectBatch={(id) => void handleSelectBatch(id)}
          />
        )}
      </section>
    </main>
  );
}

function StatusBar(props: {
  loadingLabel: string;
  message: string;
  error: string;
  selectedClient?: Client;
  latestConfig?: ImportConfig;
}) {
  return (
    <section className="status-strip" aria-live="polite">
      <span>{props.loadingLabel || props.message || "Ready"}</span>
      {props.error ? (
        <strong className="error-text">{props.error}</strong>
      ) : null}
      <span>
        {props.selectedClient
          ? props.selectedClient.code
          : "No client selected"}
      </span>
      <span>
        {props.latestConfig
          ? `Config v${props.latestConfig.version}`
          : "No config yet"}
      </span>
    </section>
  );
}

function SourcePreview({ source }: { source: PreparedImportSource | null }) {
  return (
    <div className="preview-block">
      <h3>Source preview</h3>
      <DataTable
        rows={source?.previewRows ?? []}
        emptyText="Load a source file to preview the first rows."
      />
    </div>
  );
}

function SetupPanel(props: {
  configContent: string;
  configFormat: ConfigFormat;
  configs: ImportConfig[];
  isBusy: boolean;
  newClientCode: string;
  newClientName: string;
  selectedClientId: string;
  onClientCodeChange: (value: string) => void;
  onClientNameChange: (value: string) => void;
  onConfigContentChange: (value: string) => void;
  onConfigFormatChange: (value: ConfigFormat) => void;
  onCreateClient: () => void;
  onLoadDemoConfig: () => void;
  onPromoteConfig: (id: string) => void;
  onUploadConfig: () => void;
}) {
  return (
    <div className="panel-grid">
      <div className="control-surface">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Client</p>
            <h2>Create client</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Code
            <input
              value={props.newClientCode}
              onChange={(event) => props.onClientCodeChange(event.target.value)}
            />
          </label>
          <label>
            Name
            <input
              value={props.newClientName}
              onChange={(event) => props.onClientNameChange(event.target.value)}
            />
          </label>
        </div>
        <button
          className="primary"
          onClick={props.onCreateClient}
          disabled={props.isBusy}
        >
          Create client
        </button>
      </div>

      <div className="control-surface wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Config</p>
            <h2>Upload mapping rules</h2>
          </div>
          <button className="ghost" onClick={props.onLoadDemoConfig}>
            Load demo config
          </button>
        </div>
        <div className="form-grid compact">
          <label>
            Format
            <select
              value={props.configFormat}
              onChange={(event) =>
                props.onConfigFormatChange(event.target.value as ConfigFormat)
              }
            >
              <option value="yaml">yaml</option>
              <option value="json">json</option>
            </select>
          </label>
        </div>
        <textarea
          value={props.configContent}
          onChange={(event) => props.onConfigContentChange(event.target.value)}
          spellCheck={false}
        />
        <button
          className="primary"
          onClick={props.onUploadConfig}
          disabled={props.isBusy || !props.selectedClientId}
        >
          Upload config
        </button>
      </div>

      <div className="control-surface wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Versions</p>
            <h2>Development configs</h2>
          </div>
        </div>
        <div className="version-list">
          {props.configs.length === 0 ? (
            <p className="muted">No configs for this client/environment.</p>
          ) : (
            props.configs.map((config) => (
              <div className="version-row" key={config.id}>
                <span>v{config.version}</span>
                <span>{config.status}</span>
                <span>{config.config.source?.type ?? "source"}</span>
                <button
                  className="ghost"
                  onClick={() => props.onPromoteConfig(config.id)}
                  disabled={props.isBusy || config.environment === "production"}
                >
                  Promote
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryPanel(props: {
  batches: ImportBatch[];
  orders: NormalizedOrder[];
  selectedBatch: ImportBatch | null;
  onSelectBatch: (id: string) => void;
}) {
  return (
    <div className="panel-grid">
      <div className="control-surface">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Batches</p>
            <h2>Import history</h2>
          </div>
        </div>
        <div className="batch-list">
          {props.batches.length === 0 ? (
            <p className="muted">No batches yet.</p>
          ) : (
            props.batches.map((batch) => (
              <button
                className="batch-row"
                key={batch.id}
                onClick={() => props.onSelectBatch(batch.id)}
              >
                <span>{batch.mode}</span>
                <strong>
                  {batch.validRecords}/{batch.totalRecords} valid
                </strong>
                <span>{formatDate(batch.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="control-surface wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Batch</p>
            <h2>Details</h2>
          </div>
        </div>
        {props.selectedBatch ? (
          <>
            <div className="metric-grid compact-metrics">
              <Metric label="Rows" value={props.selectedBatch.totalRecords} />
              <Metric label="Valid" value={props.selectedBatch.validRecords} />
              <Metric
                label="Invalid"
                value={props.selectedBatch.invalidRecords}
              />
              <Metric
                label="Stored"
                value={props.selectedBatch.storedRecords}
              />
            </div>
            <ErrorTable errors={props.selectedBatch.errors} />
          </>
        ) : (
          <p className="muted">
            Choose a batch to inspect its validation output.
          </p>
        )}
      </div>

      <div className="control-surface wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Orders</p>
            <h2>Stored normalized orders</h2>
          </div>
        </div>
        <DataTable
          rows={props.orders}
          columns={orderColumns}
          emptyText="No committed orders yet."
        />
      </div>
    </div>
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
          {props.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column}>{formatValue(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="eyebrow">Next step</p>
      <h3>Run a dry-run to inspect normalized rows before committing.</h3>
      <p>
        The sample file includes one clean row and one row with validation
        errors.
      </p>
    </div>
  );
}

function inferColumns(rows: SourceRecord[]): string[] {
  const columns = new Set<string>();
  rows.slice(0, 5).forEach((row) => {
    Object.keys(row).forEach((key) => columns.add(key));
  });
  return [...columns].slice(0, 8);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
