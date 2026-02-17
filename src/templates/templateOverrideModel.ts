import { model, models, Schema } from "mongoose";

const templateOverrideSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    format: { type: String, required: true, enum: ["yaml", "json"] },
    content: { type: String, required: true },
    template: { type: Schema.Types.Mixed, required: true },
    templateVersion: { type: Number, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const TemplateOverrideModel =
  models.TemplateOverride ??
  model("TemplateOverride", templateOverrideSchema, "template_overrides");
