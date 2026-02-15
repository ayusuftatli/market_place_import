# Configurable Order Import Platform

Backend MVP for small e-commerce teams that receive messy order exports from Shopify, WooCommerce, Amazon, wholesale partners, or legacy spreadsheets. The API stores versioned import configs, previews CSV/JSON imports, reports row-level validation errors, and commits normalized orders when the data is acceptable.

## Stack

- Node.js, TypeScript, Express
- MongoDB with Mongoose models
- YAML/JSON import templates
- Ajv-generated validation schemas
- CSV and JSON record ingestion
- Vitest coverage for parsing, mapping, validation, dry-runs, commits, batches, and orders

## Setup

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

## Demo Flow

Create the demo client:

```bash
curl -s http://localhost:3000/clients \
  -H 'Content-Type: application/json' \
  -d '{"code":"urban-home-store","name":"Urban Home Store"}'
```

Upload the YAML config from [examples/configs/urban-home-orders.yaml](examples/configs/urban-home-orders.yaml). Replace `<clientId>` with the ID returned above.

```bash
node -e "const fs=require('fs'); console.log(JSON.stringify({clientId:'<clientId>',environment:'development',format:'yaml',content:fs.readFileSync('examples/configs/urban-home-orders.yaml','utf8')}))" \
  | curl -s http://localhost:3000/configs \
    -H 'Content-Type: application/json' \
    -d @-
```

Dry-run the demo CSV from [examples/data/orders.csv](examples/data/orders.csv):

```bash
node -e "const fs=require('fs'); console.log(JSON.stringify({clientId:'<clientId>',environment:'development',sourceType:'csv',csvContent:fs.readFileSync('examples/data/orders.csv','utf8')}))" \
  | curl -s http://localhost:3000/imports/dry-run \
    -H 'Content-Type: application/json' \
    -d @-
```

Expected result:

- Row 1 passes.
- `Order ID` maps to `externalOrderId`.
- `Customer Email` maps to `customerEmail`.
- `eur` transforms to `EUR`.
- `Paid` transforms to `paid`.
- Row 2 fails because the email is invalid and the total is negative.

Example normalized preview:

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

Commit the same import. With `allowPartialSuccess: true`, only the valid row is stored.

```bash
node -e "const fs=require('fs'); console.log(JSON.stringify({clientId:'<clientId>',environment:'development',sourceType:'csv',csvContent:fs.readFileSync('examples/data/orders.csv','utf8')}))" \
  | curl -s http://localhost:3000/imports \
    -H 'Content-Type: application/json' \
    -d @-
```

Inspect operational records:

```bash
curl -s "http://localhost:3000/batches"
curl -s "http://localhost:3000/orders?clientId=<clientId>"
```

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
  "records": [
    {
      "order_id": "1001",
      "email": "sarah@example.com",
      "Order Total": "84.50",
      "Currency": "eur",
      "Order Date": "2026-04-10",
      "Status": "complete"
    }
  ]
}
```

## Tradeoffs

- Auth, Excel upload, approval workflows, and a React UI are intentionally outside v1.
- File upload is represented as request-body CSV text for the MVP; a multipart upload adapter can be added around the same parser.
- Tests use an in-memory store to stay fast and deterministic. Production mode uses Mongoose models and requires MongoDB.
- The transform vocabulary is deliberately small so operational users can reason about what each config does.
