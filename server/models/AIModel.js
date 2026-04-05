import mongoose from "mongoose";

const aiModelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIIntegration",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["google", "groq", "openrouter", "ollama"],
      index: true,
    },
    providerModelId: { type: String, required: true, trim: true, maxlength: 200 },
    priority: { type: Number, required: true, min: 1, index: true },
    isEnabled: { type: Boolean, default: true, index: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastUsedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

aiModelSchema.index({ priority: 1, createdAt: 1 });

export const AIModel = mongoose.model("AIModel", aiModelSchema);
