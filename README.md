# Configurable Order Import Platform

Backend MVP for small e-commerce teams that receive messy order exports from Shopify, WooCommerce, Amazon, wholesale partners, or legacy spreadsheets. The API lets operations teams define versioned import rules, preview CSV/JSON files, see row-level validation errors, and commit only the normalized orders that pass validation.

## Business Problem

Small merchants often reconcile orders from several systems with different column names, date formats, status labels, and currency casing. One partner might send `Order ID`, another sends `order_id`, and a third sends `id`; some exports use `Paid`, others use `complete`. This project turns those inconsistent files into a repeatable, auditable import flow without hard-coding a new parser for every client.

## Architecture

- Express exposes an API-first workflow for clients, configs, imports, batches, and orders.
- Import configs are YAML or JSON templates stored by `clientId + environment + version`.
- CSV and JSON parsers produce plain source records for the shared pipeline.
- The transformer maps aliases, applies explicit configured transforms, and preserves the original source record.
- Ajv validates normalized records from a schema generated from the active config.
- Dry-runs store import batch history without writing orders; committed imports store valid normalized orders when policy allows.
- MongoDB/Mongoose back production storage, while the in-memory store keeps tests and demos fast.

## Setup

Use Node.js 18 or newer; the demo script uses the built-in `fetch` API.

```bash
npm install
cp .env.example .env
npm run build
npm test
```

For a persistent local run, start MongoDB and set `MONGODB_URI` in `.env`.

```bash
npm run dev
```

For a quick non-persistent demo without MongoDB:

```bash
DATA_STORE=memory npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## Demo Assets

- Config: [examples/configs/urban-home-orders.yaml](examples/configs/urban-home-orders.yaml)
- CSV data: [examples/data/orders.csv](examples/data/orders.csv)
- JSON data: [examples/data/orders.json](examples/data/orders.json)
- Postman collection: [postman/order-import-platform.postman_collection.json](postman/order-import-platform.postman_collection.json)

The demo client is:

```json
{
  "code": "urban-home-store",
  "name": "Urban Home Store"
}
```

The CSV includes one valid row and one invalid row:

```csv
Order ID,Customer Email,Full Name,Total,Currency,Order Date,Status
1001,sarah@example.com,Sarah Miller,84.50,eur,2026-04-10,Paid
1002,bad-email,Tom Becker,-12.00,usd,2026-04-11,Paid
```

## Demo Flow

Start the API with `DATA_STORE=memory npm run dev`, then run this from another terminal:

```bash
node <<'NODE'
const fs = require("node:fs");

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "POST",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

(async () => {
  const client = await request("/clients", {
    body: {
      code: "urban-home-store",
      name: "Urban Home Store"
    }
  });

  const config = await request("/configs", {
    body: {
      clientId: client.id,
      environment: "development",
      format: "yaml",
      content: fs.readFileSync("examples/configs/urban-home-orders.yaml", "utf8")
    }
  });

  const csvContent = fs.readFileSync("examples/data/orders.csv", "utf8");
  const dryRun = await request("/imports/dry-run", {
    body: {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent
    }
  });

  const commit = await request("/imports", {
    body: {
      clientId: client.id,
      environment: "development",
      sourceType: "csv",
      csvContent
    }
  });

  const batch = await request(`/batches/${commit.batchId}`, { method: "GET" });
  const orders = await request(`/orders?clientId=${client.id}`, { method: "GET" });

  console.log(JSON.stringify({
    clientId: client.id,
    configVersion: config.version,
    dryRun,
    commit,
    batch,
    orders
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

Expected dry-run behavior:

- Row 1 passes.
- `Order ID` maps to `externalOrderId`.
- `Customer Email` maps to `customerEmail`.
- `eur` transforms to `EUR`.
- `Paid` transforms to `paid`.
- Row 2 fails because the email is invalid and the total is negative.

The normalized preview contains the valid row:

```json
{
  "externalOrderId": "1001",
  "customerName": "Sarah Miller",
  "customerEmail": "sarah@example.com",
  "orderTotal": 84.5,
  "currency": "EUR",
  "orderDate": "2026-04-10",
  "status": "paid"
}
```

The validation output includes row-level errors like:

```json
{
  "totalRecords": 2,
  "validRecords": 1,
  "invalidRecords": 1,
  "storedOrderCount": 0,
  "errors": [
    {
      "row": 2,
      "field": "customerEmail",
      "message": "customerEmail must match format 'email'",
      "value": "bad-email"
    },
    {
      "row": 2,
      "field": "orderTotal",
      "message": "orderTotal must be >= 0",
      "value": -12
    }
  ]
}
```

With `allowPartialSuccess: true`, the committed import stores the valid row and skips the invalid row.

## Main Endpoints

- `GET /health`
- `POST /clients`
- `GET /clients`
- `GET /clients/:id`
- `POST /configs`
- `GET /configs?clientId=...&environment=...`
- `GET /configs/:id`
- `POST /configs/:id/promote`
- `POST /imports/dry-run`
- `POST /imports`
- `GET /batches`
- `GET /batches/:id`
- `GET /orders?clientId=...`
- `GET /orders/:id`

## Import Request Shapes

CSV dry-run or commit:

```json
{
  "clientId": "...",
  "environment": "development",
  "sourceType": "csv",
  "csvContent": "Order ID,Customer Email,Full Name,Total,Currency,Order Date,Status\n1001,sarah@example.com,Sarah Miller,84.50,eur,2026-04-10,Paid"
}
```

JSON dry-run or commit:

```json
{
  "clientId": "...",
  "environment": "development",
  "sourceType": "json",
  "records": [
    {
      "order_id": "1001",
      "email": "sarah@example.com",
      "Customer Name": "Sarah Miller",
      "Order Total": "84.50",
      "Currency": "eur",
      "Order Date": "2026-04-10",
      "Status": "complete"
    }
  ]
}
```

## Postman

Import [postman/order-import-platform.postman_collection.json](postman/order-import-platform.postman_collection.json), start the API with `DATA_STORE=memory npm run dev`, and run the collection in order:

1. Create Client
2. Upload YAML Config
3. Dry-Run CSV Import
4. Dry-Run JSON Import
5. Commit CSV Import
6. View Batch
7. List Orders

The collection stores `clientId`, `configId`, and `batchId` as collection variables as the flow runs.

## Tradeoffs And Future Improvements

- Auth, Excel upload, approval workflows, and a React UI are intentionally outside v1.
- File upload is represented as request-body CSV text for the MVP; a multipart upload adapter can be added around the same parser.
- Tests use an in-memory store to stay fast and deterministic. Production mode uses Mongoose models and requires MongoDB.
- The transform vocabulary is deliberately small so operational users can reason about what each config does.
- Future improvements could add authenticated client workspaces, multipart uploads, Excel parsing, duplicate order detection, richer status mapping, and a lightweight review UI before commit.
