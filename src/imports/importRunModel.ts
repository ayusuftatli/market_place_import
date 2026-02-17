import { model, models, Schema } from "mongoose";

const importRunSchema = new Schema(
  {
    templateKey: { type: String, required: true, index: true },
    templateVersion: { type: Number, required: true },
    fileName: { type: String, required: true },
    inputKind: { type: String, required: true, enum: ["delimited", "records"] },
    sourceKind: { type: String, required: true, enum: ["csv", "tsv", "json"] },
    mode: { type: String, required: true, enum: ["preview", "commit"] },
    totalRecords: { type: Number, required: true },
    validRecords: { type: Number, required: true },
    invalidRecords: { type: Number, required: true },
    storedOrderCount: { type: Number, required: true },
    storedLineCount: { type: Number, required: true },
    errors: { type: [Schema.Types.Mixed], default: [] },
    orderPreview: { type: [Schema.Types.Mixed], default: [] },
    linePreview: { type: [Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    suppressReservedKeysWarning: true,
  },
);

export const ImportRunModel =
  models.ImportRun ?? model("ImportRun", importRunSchema, "import_runs");
