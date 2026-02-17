import YAML from "yaml";
import type {
  MarketplaceTemplate,
  TemplateDetail,
  TemplateSummary,
} from "../shared/types";

const builtInTemplates = {
  amazon: {
    key: "amazon",
    label: "Amazon Orders Report",
    description: "Flat-file marketplace orders with realistic Amazon columns.",
    templateVersion: 1,
    acceptedFileKinds: ["tsv", "csv", "excel"],
    sampleFileName: "amazon-orders-report.tsv",
    lineFields: {
      sourceOrderId: {
        type: "string",
        required: true,
        aliases: ["amazon-order-id", "order-id"],
      },
      sourceOrderName: {
        type: "string",
        aliases: ["merchant-order-id"],
      },
      sourceLineId: {
        type: "string",
        aliases: ["amazon-order-item-id", "order-item-id"],
      },
      salesChannel: {
        type: "string",
        aliases: ["sales-channel", "order-channel"],
      },
      orderDate: {
        type: "string",
        required: true,
        format: "date",
        aliases: ["purchase-date"],
      },
      orderStatus: {
        type: "string",
        required: true,
        aliases: ["order-status"],
      },
      fulfillmentStatus: {
        type: "string",
        aliases: ["fulfillment-channel"],
      },
      currency: {
        type: "string",
        required: true,
        aliases: ["currency"],
      },
      customerEmail: {
        type: "string",
        format: "email",
        aliases: ["buyer-email"],
      },
      customerName: {
        type: "string",
        aliases: ["buyer-name"],
      },
      shipCity: {
        type: "string",
        aliases: ["ship-city"],
      },
      shipCountry: {
        type: "string",
        aliases: ["ship-country"],
      },
      sku: {
        type: "string",
        aliases: ["sku"],
      },
      asin: {
        type: "string",
        aliases: ["asin"],
      },
      productTitle: {
        type: "string",
        required: true,
        aliases: ["product-name"],
      },
      quantity: {
        type: "number",
        required: true,
        min: 1,
        aliases: ["quantity", "quantity-purchased"],
      },
      unitPriceAmount: {
        type: "number",
        min: 0,
        aliases: ["item-price"],
      },
      lineSubtotalAmount: {
        type: "number",
        min: 0,
        aliases: ["item-price"],
      },
      lineTaxAmount: {
        type: "number",
        min: 0,
        aliases: ["item-tax"],
      },
      shippingTaxAmount: {
        type: "number",
        min: 0,
        aliases: ["shipping-tax"],
      },
      lineDiscountAmount: {
        type: "number",
        min: 0,
        aliases: ["item-promotion-discount"],
      },
      shippingDiscountAmount: {
        type: "number",
        min: 0,
        aliases: ["ship-promotion-discount"],
      },
      lineShippingAmount: {
        type: "number",
        min: 0,
        aliases: ["shipping-price"],
      },
      lineStatus: {
        type: "string",
        aliases: ["item-status"],
      },
    },
    transforms: {
      sourceOrderId: ["trim"],
      sourceOrderName: ["trim"],
      sourceLineId: ["trim"],
      salesChannel: ["trim", { type: "default", value: "Amazon" }],
      orderDate: ["trim", "dateNormalize"],
      orderStatus: ["trim", "lowercase"],
      fulfillmentStatus: ["trim", "lowercase"],
      currency: ["trim", "uppercase"],
      customerEmail: ["trim", "lowercase"],
      customerName: ["trim"],
      shipCity: ["trim"],
      shipCountry: ["trim", "uppercase"],
      sku: ["trim"],
      asin: ["trim", "uppercase"],
      productTitle: ["trim"],
      quantity: ["trim", "numberCoerce"],
      unitPriceAmount: ["trim", "numberCoerce"],
      lineSubtotalAmount: ["trim", "numberCoerce"],
      lineTaxAmount: ["trim", "numberCoerce", { type: "default", value: 0 }],
      shippingTaxAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineDiscountAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      shippingDiscountAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineShippingAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineStatus: ["trim", "lowercase"],
    },
    orderRollup: {
      keyField: "sourceOrderId",
      fields: {
        sourceOrderId: {
          type: "string",
          required: true,
          fromLineField: "sourceOrderId",
          aggregate: "first",
        },
        sourceOrderName: {
          type: "string",
          fromLineField: "sourceOrderName",
          aggregate: "firstNonEmpty",
        },
        salesChannel: {
          type: "string",
          required: true,
          fromLineField: "salesChannel",
          aggregate: "firstNonEmpty",
        },
        orderDate: {
          type: "string",
          required: true,
          format: "date",
          fromLineField: "orderDate",
          aggregate: "firstNonEmpty",
        },
        orderStatus: {
          type: "string",
          required: true,
          fromLineField: "orderStatus",
          aggregate: "firstNonEmpty",
        },
        paymentStatus: {
          type: "string",
          value: "captured",
        },
        fulfillmentStatus: {
          type: "string",
          fromLineField: "fulfillmentStatus",
          aggregate: "firstNonEmpty",
        },
        currency: {
          type: "string",
          required: true,
          fromLineField: "currency",
          aggregate: "firstNonEmpty",
        },
        subtotalAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineSubtotalAmount",
          aggregate: "sum",
        },
        shippingAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineShippingAmount",
          aggregate: "sum",
        },
        taxAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineTaxAmount",
          aggregate: "sum",
        },
        discountAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineDiscountAmount",
          aggregate: "sum",
        },
        totalAmount: {
          type: "number",
          min: 0,
        },
        itemQuantity: {
          type: "number",
          min: 0,
          fromLineField: "quantity",
          aggregate: "sum",
        },
        lineCount: {
          type: "number",
          min: 0,
          aggregate: "count",
        },
        customerEmail: {
          type: "string",
          format: "email",
          fromLineField: "customerEmail",
          aggregate: "firstNonEmpty",
        },
        customerName: {
          type: "string",
          fromLineField: "customerName",
          aggregate: "firstNonEmpty",
        },
        shipCity: {
          type: "string",
          fromLineField: "shipCity",
          aggregate: "firstNonEmpty",
        },
        shipCountry: {
          type: "string",
          fromLineField: "shipCountry",
          aggregate: "firstNonEmpty",
        },
      },
    },
    settings: {
      allowPartialSuccess: true,
      maxErrors: 20,
      previewLimit: 8,
    },
  },
  shopify: {
    key: "shopify",
    label: "Shopify Order Export",
    description: "Multi-line order export with carry-forward for repeated rows.",
    templateVersion: 1,
    acceptedFileKinds: ["csv", "excel"],
    sampleFileName: "shopify-orders-export.csv",
    preprocessing: {
      carryForwardSourceFields: [
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
        "Shipping City",
        "Shipping Country",
        "Source",
      ],
    },
    lineFields: {
      sourceOrderId: {
        type: "string",
        required: true,
        aliases: ["Id"],
      },
      sourceOrderName: {
        type: "string",
        aliases: ["Name"],
      },
      salesChannel: {
        type: "string",
        aliases: ["Source"],
      },
      orderDate: {
        type: "string",
        required: true,
        format: "date",
        aliases: ["Created at", "Paid at"],
      },
      orderStatus: {
        type: "string",
        required: true,
        aliases: ["Financial Status"],
      },
      paymentStatus: {
        type: "string",
        aliases: ["Financial Status"],
      },
      fulfillmentStatus: {
        type: "string",
        aliases: ["Fulfillment Status"],
      },
      currency: {
        type: "string",
        required: true,
        aliases: ["Currency"],
      },
      customerEmail: {
        type: "string",
        format: "email",
        aliases: ["Email"],
      },
      customerName: {
        type: "string",
        aliases: ["Shipping Name", "Billing Name"],
      },
      shipCity: {
        type: "string",
        aliases: ["Shipping City"],
      },
      shipCountry: {
        type: "string",
        aliases: ["Shipping Country"],
      },
      sku: {
        type: "string",
        aliases: ["Lineitem SKU"],
      },
      productTitle: {
        type: "string",
        required: true,
        aliases: ["Lineitem name"],
      },
      quantity: {
        type: "number",
        required: true,
        min: 1,
        aliases: ["Lineitem quantity"],
      },
      unitPriceAmount: {
        type: "number",
        min: 0,
        aliases: ["Lineitem price"],
      },
      lineSubtotalAmount: {
        type: "number",
        min: 0,
        aliases: ["Lineitem price"],
      },
      lineTaxAmount: {
        type: "number",
        min: 0,
        aliases: ["Tax 1 Value"],
      },
      lineDiscountAmount: {
        type: "number",
        min: 0,
        aliases: ["Lineitem discount"],
      },
      lineStatus: {
        type: "string",
        aliases: ["Lineitem fulfillment status"],
      },
      orderSubtotalAmount: {
        type: "number",
        min: 0,
        aliases: ["Subtotal"],
      },
      orderShippingAmount: {
        type: "number",
        min: 0,
        aliases: ["Shipping"],
      },
      orderTaxAmount: {
        type: "number",
        min: 0,
        aliases: ["Taxes"],
      },
      orderDiscountAmount: {
        type: "number",
        min: 0,
        aliases: ["Discount Amount"],
      },
      orderTotalAmount: {
        type: "number",
        min: 0,
        aliases: ["Total"],
      },
    },
    transforms: {
      sourceOrderId: ["trim"],
      sourceOrderName: ["trim"],
      salesChannel: ["trim", { type: "default", value: "shopify" }],
      orderDate: ["trim", "dateNormalize"],
      orderStatus: ["trim", "lowercase"],
      paymentStatus: ["trim", "lowercase"],
      fulfillmentStatus: ["trim", "lowercase"],
      currency: ["trim", "uppercase"],
      customerEmail: ["trim", "lowercase"],
      customerName: ["trim"],
      shipCity: ["trim"],
      shipCountry: ["trim", "uppercase"],
      sku: ["trim"],
      productTitle: ["trim"],
      quantity: ["trim", "numberCoerce"],
      unitPriceAmount: ["trim", "numberCoerce"],
      lineSubtotalAmount: ["trim", "numberCoerce"],
      lineTaxAmount: ["trim", "numberCoerce", { type: "default", value: 0 }],
      lineDiscountAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineStatus: ["trim", "lowercase"],
      orderSubtotalAmount: ["trim", "numberCoerce"],
      orderShippingAmount: ["trim", "numberCoerce"],
      orderTaxAmount: ["trim", "numberCoerce"],
      orderDiscountAmount: ["trim", "numberCoerce", { type: "default", value: 0 }],
      orderTotalAmount: ["trim", "numberCoerce"],
    },
    orderRollup: {
      keyField: "sourceOrderId",
      fields: {
        sourceOrderId: {
          type: "string",
          required: true,
          fromLineField: "sourceOrderId",
          aggregate: "first",
        },
        sourceOrderName: {
          type: "string",
          fromLineField: "sourceOrderName",
          aggregate: "firstNonEmpty",
        },
        salesChannel: {
          type: "string",
          required: true,
          fromLineField: "salesChannel",
          aggregate: "firstNonEmpty",
        },
        orderDate: {
          type: "string",
          required: true,
          format: "date",
          fromLineField: "orderDate",
          aggregate: "firstNonEmpty",
        },
        orderStatus: {
          type: "string",
          required: true,
          fromLineField: "orderStatus",
          aggregate: "firstNonEmpty",
        },
        paymentStatus: {
          type: "string",
          fromLineField: "paymentStatus",
          aggregate: "firstNonEmpty",
        },
        fulfillmentStatus: {
          type: "string",
          fromLineField: "fulfillmentStatus",
          aggregate: "firstNonEmpty",
        },
        currency: {
          type: "string",
          required: true,
          fromLineField: "currency",
          aggregate: "firstNonEmpty",
        },
        subtotalAmount: {
          type: "number",
          min: 0,
          fromLineField: "orderSubtotalAmount",
          aggregate: "firstNonEmpty",
        },
        shippingAmount: {
          type: "number",
          min: 0,
          fromLineField: "orderShippingAmount",
          aggregate: "firstNonEmpty",
        },
        taxAmount: {
          type: "number",
          min: 0,
          fromLineField: "orderTaxAmount",
          aggregate: "firstNonEmpty",
        },
        discountAmount: {
          type: "number",
          min: 0,
          fromLineField: "orderDiscountAmount",
          aggregate: "firstNonEmpty",
        },
        totalAmount: {
          type: "number",
          min: 0,
          fromLineField: "orderTotalAmount",
          aggregate: "firstNonEmpty",
        },
        itemQuantity: {
          type: "number",
          min: 0,
          fromLineField: "quantity",
          aggregate: "sum",
        },
        lineCount: {
          type: "number",
          min: 0,
          aggregate: "count",
        },
        customerEmail: {
          type: "string",
          format: "email",
          fromLineField: "customerEmail",
          aggregate: "firstNonEmpty",
        },
        customerName: {
          type: "string",
          fromLineField: "customerName",
          aggregate: "firstNonEmpty",
        },
        shipCity: {
          type: "string",
          fromLineField: "shipCity",
          aggregate: "firstNonEmpty",
        },
        shipCountry: {
          type: "string",
          fromLineField: "shipCountry",
          aggregate: "firstNonEmpty",
        },
      },
    },
    settings: {
      allowPartialSuccess: true,
      maxErrors: 20,
      previewLimit: 8,
    },
  },
  generic: {
    key: "generic",
    label: "Generic Spreadsheet",
    description: "Flexible spreadsheet import for partner or agency exports.",
    templateVersion: 1,
    acceptedFileKinds: ["csv", "tsv", "json", "excel"],
    sampleFileName: "generic-marketplace-orders.csv",
    lineFields: {
      sourceOrderId: {
        type: "string",
        required: true,
        aliases: ["Order ID", "Order Number", "Marketplace Order ID", "order_id"],
      },
      sourceOrderName: {
        type: "string",
        aliases: ["Order Name", "Reference"],
      },
      salesChannel: {
        type: "string",
        aliases: ["Channel", "Marketplace", "Source"],
      },
      orderDate: {
        type: "string",
        required: true,
        format: "date",
        aliases: ["Order Date", "Purchase Date", "Created At"],
      },
      orderStatus: {
        type: "string",
        required: true,
        aliases: ["Order Status", "Status"],
      },
      paymentStatus: {
        type: "string",
        aliases: ["Payment Status"],
      },
      fulfillmentStatus: {
        type: "string",
        aliases: ["Fulfillment Status"],
      },
      currency: {
        type: "string",
        required: true,
        aliases: ["Currency", "Currency Code"],
      },
      customerEmail: {
        type: "string",
        format: "email",
        aliases: ["Customer Email", "Email"],
      },
      customerName: {
        type: "string",
        aliases: ["Customer Name", "Full Name"],
      },
      shipCity: {
        type: "string",
        aliases: ["Shipping City", "Ship City"],
      },
      shipCountry: {
        type: "string",
        aliases: ["Shipping Country", "Ship Country"],
      },
      sku: {
        type: "string",
        aliases: ["SKU", "Seller SKU"],
      },
      asin: {
        type: "string",
        aliases: ["ASIN"],
      },
      productTitle: {
        type: "string",
        required: true,
        aliases: ["Product Title", "Product Name", "Item Name"],
      },
      variantTitle: {
        type: "string",
        aliases: ["Variant", "Variant Title"],
      },
      quantity: {
        type: "number",
        required: true,
        min: 1,
        aliases: ["Quantity", "Qty"],
      },
      unitPriceAmount: {
        type: "number",
        min: 0,
        aliases: ["Unit Price", "Item Price"],
      },
      lineSubtotalAmount: {
        type: "number",
        min: 0,
        aliases: ["Line Subtotal", "Line Total", "Item Total"],
      },
      lineTaxAmount: {
        type: "number",
        min: 0,
        aliases: ["Tax", "Line Tax"],
      },
      lineDiscountAmount: {
        type: "number",
        min: 0,
        aliases: ["Discount", "Line Discount"],
      },
      lineShippingAmount: {
        type: "number",
        min: 0,
        aliases: ["Shipping", "Line Shipping"],
      },
      lineStatus: {
        type: "string",
        aliases: ["Line Status"],
      },
    },
    transforms: {
      sourceOrderId: ["trim"],
      sourceOrderName: ["trim"],
      salesChannel: ["trim", { type: "default", value: "generic spreadsheet" }],
      orderDate: ["trim", "dateNormalize"],
      orderStatus: ["trim", "lowercase"],
      paymentStatus: ["trim", "lowercase"],
      fulfillmentStatus: ["trim", "lowercase"],
      currency: ["trim", "uppercase"],
      customerEmail: ["trim", "lowercase"],
      customerName: ["trim"],
      shipCity: ["trim"],
      shipCountry: ["trim", "uppercase"],
      sku: ["trim"],
      asin: ["trim", "uppercase"],
      productTitle: ["trim"],
      variantTitle: ["trim"],
      quantity: ["trim", "numberCoerce"],
      unitPriceAmount: ["trim", "numberCoerce"],
      lineSubtotalAmount: ["trim", "numberCoerce"],
      lineTaxAmount: ["trim", "numberCoerce", { type: "default", value: 0 }],
      lineDiscountAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineShippingAmount: [
        "trim",
        "numberCoerce",
        { type: "default", value: 0 },
      ],
      lineStatus: ["trim", "lowercase"],
    },
    orderRollup: {
      keyField: "sourceOrderId",
      fields: {
        sourceOrderId: {
          type: "string",
          required: true,
          fromLineField: "sourceOrderId",
          aggregate: "first",
        },
        sourceOrderName: {
          type: "string",
          fromLineField: "sourceOrderName",
          aggregate: "firstNonEmpty",
        },
        salesChannel: {
          type: "string",
          required: true,
          fromLineField: "salesChannel",
          aggregate: "firstNonEmpty",
        },
        orderDate: {
          type: "string",
          required: true,
          format: "date",
          fromLineField: "orderDate",
          aggregate: "firstNonEmpty",
        },
        orderStatus: {
          type: "string",
          required: true,
          fromLineField: "orderStatus",
          aggregate: "firstNonEmpty",
        },
        paymentStatus: {
          type: "string",
          fromLineField: "paymentStatus",
          aggregate: "firstNonEmpty",
        },
        fulfillmentStatus: {
          type: "string",
          fromLineField: "fulfillmentStatus",
          aggregate: "firstNonEmpty",
        },
        currency: {
          type: "string",
          required: true,
          fromLineField: "currency",
          aggregate: "firstNonEmpty",
        },
        subtotalAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineSubtotalAmount",
          aggregate: "sum",
        },
        shippingAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineShippingAmount",
          aggregate: "sum",
        },
        taxAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineTaxAmount",
          aggregate: "sum",
        },
        discountAmount: {
          type: "number",
          min: 0,
          fromLineField: "lineDiscountAmount",
          aggregate: "sum",
        },
        totalAmount: {
          type: "number",
          min: 0,
        },
        itemQuantity: {
          type: "number",
          min: 0,
          fromLineField: "quantity",
          aggregate: "sum",
        },
        lineCount: {
          type: "number",
          min: 0,
          aggregate: "count",
        },
        customerEmail: {
          type: "string",
          format: "email",
          fromLineField: "customerEmail",
          aggregate: "firstNonEmpty",
        },
        customerName: {
          type: "string",
          fromLineField: "customerName",
          aggregate: "firstNonEmpty",
        },
        shipCity: {
          type: "string",
          fromLineField: "shipCity",
          aggregate: "firstNonEmpty",
        },
        shipCountry: {
          type: "string",
          fromLineField: "shipCountry",
          aggregate: "firstNonEmpty",
        },
      },
    },
    settings: {
      allowPartialSuccess: true,
      maxErrors: 20,
      previewLimit: 8,
    },
  },
} satisfies Record<string, MarketplaceTemplate>;

export const templateRegistry = builtInTemplates;

export function getBuiltInTemplate(key: string): MarketplaceTemplate | null {
  return structuredClone(templateRegistry[key as keyof typeof templateRegistry] ?? null);
}

export function listBuiltInTemplateKeys(): string[] {
  return Object.keys(templateRegistry);
}

export function listBuiltInTemplates(): MarketplaceTemplate[] {
  return listBuiltInTemplateKeys()
    .map((key) => getBuiltInTemplate(key))
    .filter((template): template is MarketplaceTemplate => template !== null);
}

export function summarizeTemplates(
  templates: MarketplaceTemplate[],
  overrideKeys: Set<string>,
): TemplateSummary[] {
  return templates.map((template) => ({
    key: template.key,
    label: template.label,
    description: template.description,
    acceptedFileKinds: template.acceptedFileKinds,
    sampleFileName: template.sampleFileName,
    templateVersion: template.templateVersion,
    hasOverride: overrideKeys.has(template.key),
  }));
}

export function toTemplateDetail(
  template: MarketplaceTemplate,
  builtInTemplate: MarketplaceTemplate,
  override:
    | null
    | {
        format: "yaml" | "json";
        content: string;
        templateVersion: number;
        updatedAt: Date;
      },
): TemplateDetail {
  return {
    template,
    builtInContent: {
      yaml: YAML.stringify(builtInTemplate),
      json: JSON.stringify(builtInTemplate, null, 2),
    },
    override,
  };
}
