import { model, models, Schema } from "mongoose";

const orderLineSchema = new Schema(
  {
    importRunId: { type: String, required: true, index: true },
    orderId: { type: String, required: true, index: true },
    sourceOrderId: { type: String, required: true, index: true },
    sourceLineId: { type: String },
    salesChannel: { type: String, required: true },
    sku: { type: String },
    asin: { type: String },
    productTitle: { type: String, required: true },
    variantTitle: { type: String },
    quantity: { type: Number, required: true },
    unitPriceAmount: { type: Number, required: true },
    lineSubtotalAmount: { type: Number, required: true },
    lineTaxAmount: { type: Number, required: true },
    lineDiscountAmount: { type: Number, required: true },
    currency: { type: String, required: true },
    lineStatus: { type: String },
    sourceRecord: { type: Schema.Types.Mixed, required: true },
    rowNumber: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

export const OrderLineModel =
  models.OrderLine ?? model("OrderLine", orderLineSchema, "order_lines");
