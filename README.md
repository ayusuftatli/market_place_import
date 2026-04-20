# Marketplace Import Portal

A small full-stack app for reviewing marketplace order exports before they go into MongoDB.

It reads Amazon, Shopify, and generic spreadsheet-style exports, turns messy rows into clean order summaries and line items, and lets you preview the result before saving anything.

## What It Does

- Imports Amazon TSV, Shopify CSV, CSV/TSV, JSON, and Excel files.
- Normalizes source rows into orders and order lines.
- Shows preview errors before an import is committed.
- Saves committed imports and orders in MongoDB.
- Lets you search, filter, sort, and inspect saved orders in the UI.
- Includes an advanced template override drawer for unusual file formats.

## Running Locally

You need Node.js 18 or newer and a MongoDB database.

```bash
npm install
cp .env.example .env
npm run dev
```

The default `.env.example` points to a local MongoDB instance. If you use MongoDB Atlas, replace `MONGODB_URI` with the Atlas connection string and make sure your IP address is allowed.

After `npm run dev` starts:

- API: `http://localhost:3000`
- UI: `http://localhost:5173`

## Useful Commands

```bash
npm test
npm run build
npm run dev:api
npm run dev:ui
```

## Example Files

There are a few sample imports in `examples/data`:

- `amazon-orders-report.tsv`
- `shopify-orders-export.csv`
- `generic-marketplace-orders.json`

Use them in the UI to try the preview and commit flow without preparing your own data first.

## Main API Routes

- `GET /health`
- `GET /templates`
- `POST /imports/preview`
- `POST /imports`
- `GET /imports`
- `GET /orders`
- `GET /orders/:id/lines`

For most local work, the UI is the easiest way to test the full flow.
