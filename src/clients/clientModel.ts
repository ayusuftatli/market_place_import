import { model, models, Schema } from "mongoose";

const clientSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

clientSchema.index({ code: 1 }, { unique: true });

export const ClientModel =
  models.Client ?? model("Client", clientSchema, "clients");
