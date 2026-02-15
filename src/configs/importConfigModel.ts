import { model, models, Schema } from "mongoose";

const importConfigSchema = new Schema(
  {
    clientId: { type: String, required: true, index: true },
    environment: {
      type: String,
      required: true,
      enum: ["development", "production"],
      index: true
    },
    version: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "archived"],
      default: "active"
    },
    format: { type: String, required: true, enum: ["yaml", "json"] },
    config: { type: Schema.Types.Mixed, required: true },
    promotedFromVersion: { type: Number }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

importConfigSchema.index(
  { clientId: 1, environment: 1, version: 1 },
  { unique: true }
);

export const ImportConfigModel =
  models.ImportConfig ??
  model("ImportConfig", importConfigSchema, "import_configs");
