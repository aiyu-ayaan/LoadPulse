import mongoose from "mongoose";

const aiIntegrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    provider: {
      type: String,
      required: true,
      enum: ["google", "groq", "openrouter", "ollama"],
      index: true,
    },
    apiKeyEncrypted: { type: String, default: "" },
    apiKeyPreview: { type: String, default: "" },
    baseUrl: { type: String, default: "", trim: true, maxlength: 2048 },
    isEnabled: { type: Boolean, default: true, index: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastValidatedAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

aiIntegrationSchema.index({ createdAt: -1 });
aiIntegrationSchema.index({ provider: 1, isEnabled: 1, createdAt: -1 });

export const AIIntegration = mongoose.model("AIIntegration", aiIntegrationSchema);
