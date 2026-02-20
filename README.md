# Marketplace Import Portal

Single-workspace import portal for client-facing order review. The app focuses on realistic Amazon, Shopify, and generic spreadsheet exports, then rolls those files into normalized order summaries with line-item drill-down.

## What It Does

- Preview or commit marketplace imports from:
  - Amazon flat-file order reports
  - Shopify order export CSVs
  - Generic CSV, TSV, JSON, and Excel spreadsheets
- Normalize line-based source rows into:
  - `OrderSummary`
  - `OrderLine`
- Keep recent import history, row-level validation errors, and stored line-item detail in one place.
- Hide multi-client and environment setup from the main UI.
- Offer a secondary advanced drawer for raw YAML/JSON template overrides.

## Main API

- `GET /health`
- `GET /templates`
- `GET /templates/:key`
- `PUT /templates/:key/override`
- `DELETE /templates/:key/override`
- `POST /imports/preview`
- `POST /imports`
- `GET /imports`
- `GET /imports/:id`
- `GET /orders`
- `GET /orders/:id/lines`

Import requests use the new public shape:

```json
{
  "templateKey": "amazon",
  "inputKind": "delimited",
  "fileName": "amazon-orders-report.tsv",
  "content": "..."
}
```

Or, for browser-parsed JSON / Excel:

```json
{
  "templateKey": "generic",
  "inputKind": "records",
  "fileName": "generic-marketplace-orders.xlsx",
  "records": [
    {
      "Marketplace Order ID": "GEN-9101"
    }
  ]
}
```

## Setup

Use Node.js 18 or newer.

```bash
npm install
npm run build
npm test
```

### Connect to MongoDB Atlas

This repo connects to MongoDB whenever [`DATA_STORE`](src/server.ts:8) is not set to `memory`. The server reads [`MONGODB_URI`](src/shared/database.ts:3) from your environment and fails fast if it is missing.

1. In Atlas, open your cluster and copy the **Drivers** connection string for Node.js.
2. Replace `<username>`, `<password>`, and, if needed, the default database name in the URI.
3. Make sure your Atlas database user has read/write access.
4. Make sure your current IP address is allowed in Atlas **Network Access**.
5. Create a local [`.env`](.env) file in the project root:

```bash
cp .env.example .env
```

Then update [`.env`](.env) so it looks like this:

```dotenv
PORT=3000
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR-CLUSTER.mongodb.net/order_import_platform?retryWrites=true&w=majority&appName=Cluster0
```

Notes for this repo:

- Do **not** set [`DATA_STORE=memory`](README.md:71) when you want Atlas.
- The database name can be kept in the URI path, such as `order_import_platform`.
- [`.env`](.gitignore:21) is already ignored by git.
- If your password contains reserved URL characters such as `@`, `:`, `/`, or `#`, URL-encode it before placing it in the connection string.

Start the API against Atlas:

```bash
npm run dev:api
```

For the split workflow, run the UI separately:

```bash
npm run dev:api
npm run dev:ui
```

If you currently have the in-memory server running, stop that process first and restart without the `DATA_STORE=memory` prefix.

Expected behavior:

- the API starts without the missing-URI error from [`connectToDatabase()`](src/shared/database.ts:3)
- imported orders persist in MongoDB instead of memory
- restarting the API does not remove previously imported records

Common Atlas issues:

- `MONGODB_URI is required...`: [`.env`](.env) is missing or not loaded
- authentication failed: username or password in the URI is wrong
- IP/network timeout: your current machine is not allowed in Atlas **Network Access**
- DNS or SRV error: use the full Atlas `mongodb+srv://` string copied from Atlas Drivers

For a non-persistent local demo:

```bash
DATA_STORE=memory npm run dev
```

The API listens on `http://localhost:3000` and the built UI is served directly from `http://localhost:3000/`.

For a split local workflow:

```bash
DATA_STORE=memory npm run dev:api
npm run dev:ui
```

## Demo Assets

- Amazon TSV: [examples/data/amazon-orders-report.tsv](examples/data/amazon-orders-report.tsv)
- Shopify CSV: [examples/data/shopify-orders-export.csv](examples/data/shopify-orders-export.csv)
- Generic JSON: [examples/data/generic-marketplace-orders.json](examples/data/generic-marketplace-orders.json)

These source shapes are modeled on official docs:

- Shopify order export reference: https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders
- Amazon order reports reference: https://developer-docs.amazon.com/sp-api/docs/report-type-values-order

## Example Flow

Preview Amazon TSV data:

```bash
curl -X POST http://localhost:3000/imports/preview \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "templateKey": "amazon",
  "inputKind": "delimited",
  "fileName": "amazon-orders-report.tsv",
  "content": "amazon-order-id\tmerchant-order-id\tpurchase-date\torder-status\tfulfillment-channel\tsales-channel\torder-channel\tproduct-name\tsku\tasin\titem-status\tquantity\tcurrency\titem-price\titem-tax\tshipping-price\tshipping-tax\titem-promotion-discount\tship-promotion-discount\tship-city\tship-country\n112-9739103-000001\tM-10001\t2026-04-10T09:15:00Z\tshipped\tAFN\tAmazon.de\tAmazon.de\tOrganic Cotton Sheet Set\tOCH-QUEEN\tB0TESTAMZ1\tshipped\t1\tEUR\t89.90\t17.08\t0.00\t0.00\t10.00\t0.00\tBerlin\tDE"
}
JSON
```

You should get:

- `templateVersion`
- row counts
- `orderPreview`
- `linePreview`
- row-level `errors`

## UI Notes

The React UI is built as a client-facing portal:

- choose one template
- drop in a file
- preview or commit
- inspect order summaries
- click through to line items
- review recent imports
- open the advanced drawer only when raw template editing is actually needed
