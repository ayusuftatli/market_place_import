import { model, models, Schema } from "mongoose";

const orderSummarySchema = new Schema(
  {
    importRunId: { type: String, required: true, index: true },
    sourceOrderId: { type: String, required: true, index: true },
    sourceOrderName: { type: String },
    salesChannel: { type: String, required: true },
    orderDate: { type: String, required: true },
    orderStatus: { type: String, required: true },
    paymentStatus: { type: String },
    fulfillmentStatus: { type: String },
    currency: { type: String, required: true },
    subtotalAmount: { type: Number, required: true },
    shippingAmount: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    discountAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    itemQuantity: { type: Number, required: true },
    lineCount: { type: Number, required: true },
    customerEmail: { type: String },
    customerName: { type: String },
    shipCity: { type: String },
    shipCountry: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

export const OrderSummaryModel =
  models.OrderSummary ??
  model("OrderSummary", orderSummarySchema, "order_summaries");
