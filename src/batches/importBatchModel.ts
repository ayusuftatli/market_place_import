import { model, models, Schema } from "mongoose";

const importBatchSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    environment: {
      type: String,
      required: true,
      enum: ["development", "production"],
      index: true
    },
    configId: { type: String, required: true, index: true },
    configVersion: { type: Number, required: true },
    sourceType: { type: String, required: true, enum: ["csv", "json"] },
    mode: { type: String, required: true, enum: ["dry-run", "commit"] },
    totalRecords: { type: Number, required: true },
    validRecords: { type: Number, required: true },
    invalidRecords: { type: Number, required: true },
    storedRecords: { type: Number, required: true },
    errors: { type: [Schema.Types.Mixed], default: [] }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    suppressReservedKeysWarning: true
  }
);

export const ImportBatchModel =
  models.ImportBatch ?? model("ImportBatch", importBatchSchema, "import_batches");
