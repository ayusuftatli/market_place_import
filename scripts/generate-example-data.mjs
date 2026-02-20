#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROWS = 300;
const DEFAULT_SEED = 20260420;

const AMAZON_HEADERS = [
  "amazon-order-id",
  "merchant-order-id",
  "purchase-date",
  "order-status",
  "fulfillment-channel",
  "sales-channel",
  "order-channel",
  "product-name",
  "sku",
  "asin",
  "item-status",
  "quantity",
  "currency",
  "item-price",
  "item-tax",
  "shipping-price",
  "shipping-tax",
  "item-promotion-discount",
  "ship-promotion-discount",
  "ship-city",
  "ship-country",
];

const SHOPIFY_HEADERS = [
  "Id",
  "Name",
  "Email",
  "Financial Status",
  "Fulfillment Status",
  "Paid at",
  "Created at",
  "Currency",
  "Subtotal",
  "Shipping",
  "Taxes",
  "Total",
  "Discount Amount",
  "Source",
  "Shipping Name",
  "Shipping City",
  "Shipping Country",
  "Lineitem quantity",
  "Lineitem name",
  "Lineitem price",
  "Lineitem SKU",
  "Lineitem discount",
  "Lineitem fulfillment status",
];

const GENERIC_HEADERS = [
  "Marketplace Order ID",
  "Channel",
  "Order Date",
  "Order Status",
  "Payment Status",
  "Fulfillment Status",
  "Currency",
  "Customer Email",
  "Customer Name",
  "Shipping City",
  "Shipping Country",
  "SKU",
  "Product Title",
  "Variant",
  "Quantity",
  "Unit Price",
  "Line Total",
  "Tax",
  "Discount",
  "Shipping",
];

const PRODUCTS = [
  ["Cashmere Throw", "THROW-CASH", "Ivory", 79],
  ["Brass Candle Holder", "CANDLE-BRASS", "Tall", 19.5],
  ["Glass Storage Jar", "JAR-GLASS", "1L", 16],
  ["Matte Table Lamp", "LAMP-MATTE", "Black", 54.5],
  ["Linen Lamp Shade", "SHADE-LINEN", "Natural", 28],
  ["Oak Serving Tray", "TRAY-OAK", "Large", 64],
  ["Stoneware Plate", "PLATE-STONE", "Set of 4", 36],
  ["Serving Bowl", "BOWL-SERVE", "Ivory", 22.5],
  ["Organic Cotton Sheet Set", "SHEET-COTTON", "Queen", 89.9],
  ["Wool Cushion Cover", "CUSHION-WOOL", "Moss", 34],
  ["Ceramic Pour-Over Set", "POUR-CERAMIC", "White", 42],
  ["Walnut Desk Organizer", "DESK-WALNUT", "Three slot", 48],
  ["Recycled Wool Blanket", "BLANKET-WOOL", "Plaid", 72],
  ["Steel Wall Hook", "HOOK-STEEL", "Matte", 12.75],
  ["Bamboo Bath Towel", "TOWEL-BAMBOO", "Sage", 24],
  ["Enamel Mixing Bowl", "BOWL-ENAMEL", "Blue", 31.5],
];

const CUSTOMERS = [
  ["Olivia Reed", "Berlin", "DE"],
  ["Leo Martin", "Munich", "DE"],
  ["Ava Shah", "Cologne", "DE"],
  ["Noah Park", "Austin", "US"],
  ["Mia Foster", "London", "GB"],
  ["Ben Carter", "Manchester", "GB"],
  ["Sofia Novak", "Prague", "CZ"],
  ["Lina Weber", "Vienna", "AT"],
  ["Jonas Keller", "Zurich", "CH"],
  ["Emma Rossi", "Milan", "IT"],
  ["Lucas Meyer", "Hamburg", "DE"],
  ["Amara Okafor", "Dublin", "IE"],
];

const CURRENCIES_BY_COUNTRY = {
  AT: "EUR",
  CH: "CHF",
  CZ: "CZK",
  DE: "EUR",
  GB: "GBP",
  IE: "EUR",
  IT: "EUR",
  US: "USD",
};

const CHANNELS = [
  "Amazon.de",
  "Amazon.co.uk",
  "Wholesale Portal",
  "Agency Sheet",
  "Retail POS",
  "Marketplace Connect",
];

const ORDER_STATUSES = ["paid", "pending", "authorized", "refunded"];
const FULFILLMENT_STATUSES = [
  "fulfilled",
  "unfulfilled",
  "partial",
  "shipped",
  "processing",
];
const AMAZON_ORDER_STATUSES = ["shipped", "unshipped", "pending"];
const AMAZON_FULFILLMENT_CHANNELS = ["AFN", "MFN"];
const SHOPIFY_SOURCES = ["web", "pos", "shopify_draft_order", "marketplace"];

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const defaultOutDir = join(rootDir, "..", "examples", "data");
  const outDir = options.outDir ?? defaultOutDir;
  const random = createRandom(options.seed);

  const amazonRows = generateAmazonRows(options.rows, random);
  const shopifyRows = generateShopifyRows(options.rows, random);
  const genericRows = generateGenericRows(options.rows, random);
  const amazonContent = formatDelimited(AMAZON_HEADERS, amazonRows, "\t");
  const shopifyContent = formatDelimited(SHOPIFY_HEADERS, shopifyRows, ",");
  const genericCsvContent = formatDelimited(GENERIC_HEADERS, genericRows, ",");
  const genericJsonContent = `${JSON.stringify(genericRows, null, 2)}\n`;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "amazon-orders-report.tsv"), amazonContent);
  writeFileSync(join(outDir, "shopify-orders-export.csv"), shopifyContent);
  writeFileSync(
    join(outDir, "generic-marketplace-orders.csv"),
    genericCsvContent,
  );
  writeFileSync(
    join(outDir, "generic-marketplace-orders.json"),
    genericJsonContent,
  );

  console.log(`Generated synthetic example data with seed ${options.seed}:`);
  console.log(`- ${amazonRows.length} Amazon TSV rows`);
  console.log(`- ${shopifyRows.length} Shopify CSV rows`);
  console.log(`- ${genericRows.length} Generic CSV rows`);
  console.log(`- ${genericRows.length} Generic JSON rows`);
}

function parseArgs(args) {
  const options = {
    outDir: undefined,
    rows: DEFAULT_ROWS,
    seed: DEFAULT_SEED,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--help" || arg === "-h") {
      printUsageAndExit();
    }

    if (arg === "--rows") {
      options.rows = parsePositiveInteger(next, "--rows");
      index += 1;
      continue;
    }

    if (arg.startsWith("--rows=")) {
      options.rows = parsePositiveInteger(
        arg.slice("--rows=".length),
        "--rows",
      );
      continue;
    }

    if (arg === "--seed") {
      options.seed = parsePositiveInteger(next, "--seed");
      index += 1;
      continue;
    }

    if (arg.startsWith("--seed=")) {
      options.seed = parsePositiveInteger(
        arg.slice("--seed=".length),
        "--seed",
      );
      continue;
    }

    if (arg === "--out-dir") {
      options.outDir = requireValue(next, "--out-dir");
      index += 1;
      continue;
    }

    if (arg.startsWith("--out-dir=")) {
      options.outDir = requireValue(
        arg.slice("--out-dir=".length),
        "--out-dir",
      );
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printUsageAndExit() {
  console.log(`Usage: node scripts/generate-example-data.mjs [options]

Options:
  --rows <number>      Data rows to write to each example file. Default: ${DEFAULT_ROWS}
  --seed <number>      Seed for repeatable random-looking data. Default: ${DEFAULT_SEED}
  --out-dir <path>     Directory to write data files. Default: examples/data
`);
  process.exit(0);
}

function parsePositiveInteger(value, label) {
  const required = requireValue(value, label);
  const parsed = Number(required);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function requireValue(value, label) {
  if (value === undefined || value.length === 0) {
    throw new Error(`${label} requires a value.`);
  }

  return value;
}

function generateAmazonRows(rowTarget, random) {
  const rows = [];
  let orderNumber = 10001;

  while (rows.length < rowTarget) {
    const lineCount = Math.min(random.integer(1, 4), rowTarget - rows.length);
    const customer = random.pick(CUSTOMERS);
    const currency = CURRENCIES_BY_COUNTRY[customer[2]] ?? "EUR";
    const orderDate = randomDateTime(random);
    const orderStatus = random.pick(AMAZON_ORDER_STATUSES);
    const fulfillmentChannel = random.pick(AMAZON_FULFILLMENT_CHANNELS);
    const salesChannel = customer[2] === "GB" ? "Amazon.co.uk" : "Amazon.de";
    const orderId = `112-${random.integer(1000000, 9999999)}-${String(orderNumber).padStart(6, "0")}`;
    const merchantOrderId = `M-${orderNumber}`;

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const line = createLine(random, lineIndex);
      const tax = line.subtotal * taxRateFor(customer[2]);
      const shipping = lineIndex === 0 ? random.money(0, 9.99) : 0;
      const shippingTax = shipping * taxRateFor(customer[2]);
      const discount = random.chance(0.22)
        ? random.money(1, Math.min(12, line.subtotal * 0.2))
        : 0;

      rows.push({
        "amazon-order-id": orderId,
        "merchant-order-id": merchantOrderId,
        "purchase-date": orderDate,
        "order-status": orderStatus,
        "fulfillment-channel": fulfillmentChannel,
        "sales-channel": salesChannel,
        "order-channel": salesChannel,
        "product-name": line.productName,
        sku: line.sku,
        asin: createAsin(orderNumber, lineIndex),
        "item-status": orderStatus === "shipped" ? "shipped" : "unshipped",
        quantity: String(line.quantity),
        currency,
        "item-price": money(line.subtotal),
        "item-tax": money(tax),
        "shipping-price": money(shipping),
        "shipping-tax": money(shippingTax),
        "item-promotion-discount": money(discount),
        "ship-promotion-discount": "0.00",
        "ship-city": customer[1],
        "ship-country": customer[2],
      });
    }

    orderNumber += 1;
  }

  return rows;
}

function generateShopifyRows(rowTarget, random) {
  const rows = [];
  let orderNumber = 5001001;

  while (rows.length < rowTarget) {
    const lineCount = Math.min(random.integer(1, 4), rowTarget - rows.length);
    const customer = random.pick(CUSTOMERS);
    const currency = CURRENCIES_BY_COUNTRY[customer[2]] ?? "EUR";
    const createdAt = randomDateTime(random);
    const paidAt = random.chance(0.82)
      ? addMinutes(createdAt, random.integer(3, 180))
      : "";
    const source = random.pick(SHOPIFY_SOURCES);
    const financialStatus = random.pick(ORDER_STATUSES);
    const fulfillmentStatus = random.pick(FULFILLMENT_STATUSES);
    const lines = Array.from({ length: lineCount }, (_, lineIndex) =>
      createLine(random, lineIndex),
    );
    const subtotal = sum(lines.map((line) => line.subtotal));
    const shipping = random.money(0, 12.5);
    const taxes = subtotal * taxRateFor(customer[2]);
    const discount = random.chance(0.3)
      ? random.money(2, Math.min(18, subtotal * 0.18))
      : 0;
    const total = subtotal + shipping + taxes - discount;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const orderFields =
        lineIndex === 0
          ? {
              Id: String(orderNumber),
              Name: `#${String(orderNumber - 5000000).padStart(4, "0")}`,
              Email: emailFor(customer[0], orderNumber),
              "Financial Status": financialStatus,
              "Fulfillment Status": fulfillmentStatus,
              "Paid at": paidAt,
              "Created at": createdAt,
              Currency: currency,
              Subtotal: money(subtotal),
              Shipping: money(shipping),
              Taxes: money(taxes),
              Total: money(total),
              "Discount Amount": money(discount),
              Source: source,
              "Shipping Name": customer[0],
              "Shipping City": customer[1],
              "Shipping Country": customer[2],
            }
          : emptyObjectFor(SHOPIFY_HEADERS.slice(0, 17));

      rows.push({
        ...orderFields,
        "Lineitem quantity": String(line.quantity),
        "Lineitem name": line.productName,
        "Lineitem price": money(line.unitPrice),
        "Lineitem SKU": line.sku,
        "Lineitem discount": money(line.discount),
        "Lineitem fulfillment status": fulfillmentStatus,
      });
    }

    orderNumber += 1;
  }

  return rows;
}

function generateGenericRows(rowTarget, random) {
  const rows = [];
  let orderNumber = 9101;

  while (rows.length < rowTarget) {
    const lineCount = Math.min(random.integer(1, 4), rowTarget - rows.length);
    const customer = random.pick(CUSTOMERS);
    const currency = CURRENCIES_BY_COUNTRY[customer[2]] ?? "EUR";
    const channel = random.pick(CHANNELS);
    const orderDate = randomDate(random);
    const orderStatus = random.pick(ORDER_STATUSES);
    const fulfillmentStatus = random.pick(FULFILLMENT_STATUSES);
    const paymentStatus =
      orderStatus === "paid"
        ? "paid"
        : random.pick(["authorized", "pending", "paid"]);
    const shipping = random.money(0, 10);

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const line = createLine(random, lineIndex);
      const tax = line.subtotal * taxRateFor(customer[2]);
      const discount = random.chance(0.24)
        ? random.money(1, Math.min(10, line.subtotal * 0.15))
        : 0;

      rows.push({
        "Marketplace Order ID": `GEN-${orderNumber}`,
        Channel: channel,
        "Order Date": orderDate,
        "Order Status": orderStatus,
        "Payment Status": paymentStatus,
        "Fulfillment Status": fulfillmentStatus,
        Currency: currency,
        "Customer Email": emailFor(customer[0], orderNumber),
        "Customer Name": customer[0],
        "Shipping City": customer[1],
        "Shipping Country": customer[2],
        SKU: line.sku,
        "Product Title": line.productName,
        Variant: line.variant,
        Quantity: String(line.quantity),
        "Unit Price": money(line.unitPrice),
        "Line Total": money(line.subtotal),
        Tax: money(tax),
        Discount: money(discount),
        Shipping: money(lineIndex === 0 ? shipping : 0),
      });
    }

    orderNumber += 1;
  }

  return rows;
}

function createLine(random, lineIndex) {
  const [productName, skuPrefix, variant, basePrice] = random.pick(PRODUCTS);
  const quantity = random.integer(1, 4);
  const unitPrice = Math.max(1, basePrice + random.money(-5, 8));
  const subtotal = unitPrice * quantity;
  const discount = random.chance(0.18)
    ? random.money(0.5, Math.min(8, subtotal * 0.15))
    : 0;

  return {
    discount,
    productName,
    quantity,
    sku: `${skuPrefix}-${String(random.integer(1, 99)).padStart(2, "0")}-${lineIndex + 1}`,
    subtotal,
    unitPrice,
    variant,
  };
}

function formatDelimited(headers, rows, delimiter) {
  const lines = [
    headers
      .map((header) => escapeDelimitedValue(header, delimiter))
      .join(delimiter),
    ...rows.map((row) =>
      headers
        .map((header) => escapeDelimitedValue(row[header] ?? "", delimiter))
        .join(delimiter),
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function escapeDelimitedValue(value, delimiter) {
  const stringValue = String(value);
  const mustQuote =
    stringValue.includes(delimiter) ||
    stringValue.includes("\n") ||
    stringValue.includes("\r") ||
    stringValue.includes('"');

  return mustQuote ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function emptyObjectFor(keys) {
  return Object.fromEntries(keys.map((key) => [key, ""]));
}

function randomDate(random) {
  const date = new Date(Date.UTC(2026, 0, 1 + random.integer(0, 119)));
  return date.toISOString().slice(0, 10);
}

function randomDateTime(random) {
  const date = new Date(Date.UTC(2026, 0, 1 + random.integer(0, 119)));
  date.setUTCHours(random.integer(7, 21), random.integer(0, 59), 0, 0);
  return date.toISOString();
}

function addMinutes(isoDate, minutes) {
  const date = new Date(isoDate);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function createAsin(orderNumber, lineIndex) {
  return `B0SYN${String(orderNumber).slice(-4)}${String(lineIndex + 1).padStart(2, "0")}`;
}

function emailFor(name, orderNumber) {
  return `${name
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.+|\.+$/g, "")}.${orderNumber}@example.com`;
}

function taxRateFor(country) {
  if (country === "US") {
    return 0.0825;
  }

  if (country === "GB") {
    return 0.2;
  }

  if (country === "CH") {
    return 0.081;
  }

  if (country === "CZ") {
    return 0.21;
  }

  return 0.19;
}

function money(value) {
  return value.toFixed(2);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function createRandom(seed) {
  let state = seed >>> 0;

  return {
    chance(probability) {
      return this.next() < probability;
    },
    integer(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    money(min, max) {
      return Math.round((this.next() * (max - min) + min) * 100) / 100;
    },
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    pick(values) {
      return values[this.integer(0, values.length - 1)];
    },
  };
}

main();
