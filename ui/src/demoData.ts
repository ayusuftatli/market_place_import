import type { SourceRecord } from "./types";

export const AMAZON_SAMPLE_TSV = `amazon-order-id	merchant-order-id	purchase-date	order-status	fulfillment-channel	sales-channel	order-channel	product-name	sku	asin	item-status	quantity	currency	item-price	item-tax	shipping-price	shipping-tax	item-promotion-discount	ship-promotion-discount	ship-city	ship-country
112-9739103-000001	M-10001	2026-04-10T09:15:00Z	shipped	AFN	Amazon.de	Amazon.de	Organic Cotton Sheet Set	OCH-QUEEN	B0TESTAMZ1	shipped	1	EUR	89.90	17.08	0.00	0.00	10.00	0.00	Berlin	DE
112-9739103-000002	M-10002	2026-04-11T14:42:00Z	unshipped	MFN	Amazon.de	Amazon.de	Stoneware Mug Set	MUG-SET-4	B0TESTAMZ2	unshipped	2	EUR	42.00	7.98	5.99	1.14	0.00	0.00	Hamburg	DE
112-9739103-000002	M-10002	2026-04-11T14:42:00Z	unshipped	MFN	Amazon.de	Amazon.de	Linen Napkins	NAPKIN-SET	B0TESTAMZ3	unshipped	1	EUR	18.00	3.42	0.00	0.00	2.00	0.00	Hamburg	DE`;

export const SHOPIFY_SAMPLE_CSV = `Id,Name,Email,Financial Status,Fulfillment Status,Paid at,Created at,Currency,Subtotal,Shipping,Taxes,Total,Discount Amount,Source,Shipping Name,Shipping City,Shipping Country,Lineitem quantity,Lineitem name,Lineitem price,Lineitem SKU,Lineitem discount,Lineitem fulfillment status
5001001,#1001,olivia@example.com,paid,fulfilled,2026-04-12T08:10:00Z,2026-04-12T08:02:00Z,EUR,118.00,8.90,22.21,139.11,9.99,web,Olivia Reed,Berlin,DE,1,Cashmere Throw,79.00,THROW-CASH-01,9.99,fulfilled
,,,,,,,,,,,,,,,,,2,Brass Candle Holder,19.50,CANDLE-BRASS-02,0.00,fulfilled
5001002,#1002,leo@example.com,authorized,unfulfilled,2026-04-13T09:18:00Z,2026-04-13T09:10:00Z,USD,48.00,6.00,4.56,58.56,0.00,pos,Leo Martin,Munich,DE,3,Glass Storage Jar,16.00,JAR-GLASS-03,0.00,unfulfilled`;

export const GENERIC_SAMPLE_CSV = `Marketplace Order ID,Channel,Order Date,Order Status,Payment Status,Fulfillment Status,Currency,Customer Email,Customer Name,Shipping City,Shipping Country,SKU,Product Title,Variant,Quantity,Unit Price,Line Total,Tax,Discount,Shipping
GEN-9001,Wholesale Portal,2026-04-14,paid,paid,packed,EUR,ava@example.com,Ava Shah,Cologne,DE,LAMP-001,Matte Table Lamp,Black,2,54.50,109.00,20.71,5.00,6.50
GEN-9001,Wholesale Portal,2026-04-14,paid,paid,packed,EUR,ava@example.com,Ava Shah,Cologne,DE,SHADE-002,Linen Lamp Shade,Sand,1,28.00,28.00,5.32,0.00,0.00
GEN-9002,Agency Sheet,2026-04-15,pending,authorized,queued,USD,noah@example.com,Noah Park,Austin,US,TRAY-003,Oak Serving Tray,Large,1,64.00,64.00,5.12,0.00,7.50`;

export const GENERIC_SAMPLE_JSON: SourceRecord[] = [
  {
    "Marketplace Order ID": "GEN-9101",
    Channel: "Agency Sheet",
    "Order Date": "2026-04-16",
    "Order Status": "paid",
    "Payment Status": "paid",
    "Fulfillment Status": "shipped",
    Currency: "GBP",
    "Customer Email": "mia@example.com",
    "Customer Name": "Mia Foster",
    "Shipping City": "London",
    "Shipping Country": "GB",
    SKU: "PLATE-004",
    "Product Title": "Stoneware Plate",
    Variant: "Set of 4",
    Quantity: "1",
    "Unit Price": "36.00",
    "Line Total": "36.00",
    Tax: "7.20",
    Discount: "0.00",
    Shipping: "4.50",
  },
  {
    "Marketplace Order ID": "GEN-9102",
    Channel: "Agency Sheet",
    "Order Date": "2026-04-16",
    "Order Status": "paid",
    "Payment Status": "paid",
    "Fulfillment Status": "processing",
    Currency: "GBP",
    "Customer Email": "ben@example.com",
    "Customer Name": "Ben Carter",
    "Shipping City": "Manchester",
    "Shipping Country": "GB",
    SKU: "BOWL-005",
    "Product Title": "Serving Bowl",
    Variant: "Ivory",
    Quantity: "2",
    "Unit Price": "22.50",
    "Line Total": "45.00",
    Tax: "9.00",
    Discount: "5.00",
    Shipping: "6.00",
  },
];
