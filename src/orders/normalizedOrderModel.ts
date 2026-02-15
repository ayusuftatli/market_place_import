import { model, models, Schema } from "mongoose";

const normalizedOrderSchema = new Schema(
  {
    batchId: { type: String, required: true, index: true },
    clientId: { type: String, required: true, index: true },
    externalOrderId: { type: String, required: true, index: true },
    customerName: { type: String },
    customerEmail: { type: String, required: true },
    orderTotal: { type: Number, required: true },
    currency: { type: String, required: true },
    orderDate: { type: String, required: true },
    status: { type: String, required: true },
    sourceRecord: { type: Schema.Types.Mixed, required: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

export const NormalizedOrderModel =
  models.NormalizedOrder ??
  model("NormalizedOrder", normalizedOrderSchema, "normalized_orders");
