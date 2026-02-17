import type { SourceRecord } from "./types";

export const DEMO_CLIENT_CODE = "urban-home-store";
export const DEMO_CLIENT_NAME = "Urban Home Store";

export const DEMO_CONFIG_YAML = `client: urban-home-store
environment: development
version: 1
source:
  type: csv
  name: partner-order-export
fields:
  externalOrderId:
    type: string
    required: true
    aliases:
      - Order ID
      - order_id
      - id
  customerName:
    type: string
    aliases:
      - Full Name
      - Customer Name
      - name
  customerEmail:
    type: string
    required: true
    format: email
    aliases:
      - Customer Email
      - email
  orderTotal:
    type: number
    required: true
    min: 0
    aliases:
      - Total
      - Order Total
      - amount
  currency:
    type: string
    required: true
    enum:
      - USD
      - EUR
      - GBP
    aliases:
      - Currency
      - currency_code
  orderDate:
    type: string
    required: true
    format: date
    aliases:
      - Order Date
      - date
  status:
    type: string
    required: true
    enum:
      - paid
      - pending
      - cancelled
      - refunded
    aliases:
      - Status
      - Order Status
transforms:
  externalOrderId:
    - trim
  customerName:
    - trim
    - type: default
      value: Unknown Customer
  customerEmail:
    - trim
    - lowercase
  orderTotal:
    - trim
    - numberCoerce
  currency:
    - trim
    - uppercase
    - type: default
      value: USD
  orderDate:
    - trim
    - dateNormalize
  status:
    - trim
    - lowercase
    - type: enumMap
      map:
        paid: paid
        complete: paid
        completed: paid
        pending: pending
        cancelled: cancelled
        canceled: cancelled
        refunded: refunded
settings:
  allowPartialSuccess: true
  maxErrors: 20
  previewLimit: 10
`;

export const DEMO_CSV = `Order ID,Customer Email,Full Name,Total,Currency,Order Date,Status
1001,sarah@example.com,Sarah Miller,84.50,eur,2026-04-10,Paid
1002,bad-email,Tom Becker,-12.00,usd,2026-04-11,Paid`;

export const DEMO_JSON_RECORDS: SourceRecord[] = [
  {
    order_id: "1001",
    email: "sarah@example.com",
    "Customer Name": "Sarah Miller",
    "Order Total": "84.50",
    Currency: "eur",
    "Order Date": "2026-04-10",
    Status: "complete",
  },
  {
    order_id: "1002",
    email: "bad-email",
    "Customer Name": "Tom Becker",
    "Order Total": "-12.00",
    Currency: "usd",
    "Order Date": "2026-04-11",
    Status: "paid",
  },
];

export const DEMO_ORDER_HEADERS = [
  "order_id",
  "email",
  "Customer Name",
  "Order Total",
  "Currency",
  "Order Date",
  "Status",
];
