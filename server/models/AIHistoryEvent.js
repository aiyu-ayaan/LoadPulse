import mongoose from "mongoose";

const aiHistoryEventSchema = new mongoose.Schema(
  {
    contextType: {
      type: String,
      enum: ["test-summary", "test-config", "other"],
      default: "other",
      index: true,
    },
    contextAction: { type: String, default: "", trim: true, maxlength: 80 },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestRun",
      default: null,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    actorUsername: { type: String, default: "", trim: true, maxlength: 120, index: true },
    actorEmail: { type: String, default: "", trim: true, maxlength: 200, index: true },
    provider: { type: String, default: "", trim: true, maxlength: 60, index: true },
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIIntegration",
      default: null,
      index: true,
    },
    integrationName: { type: String, default: "", trim: true, maxlength: 120 },
    modelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AIModel",
      default: null,
      index: true,
    },
    modelName: { type: String, default: "", trim: true, maxlength: 140 },
    providerModelId: { type: String, default: "", trim: true, maxlength: 220 },
    status: { type: String, enum: ["success", "failed"], required: true, index: true },
    error: { type: String, default: "", trim: true, maxlength: 2000 },
    promptSystem: { type: String, default: "" },
    promptUser: { type: String, default: "" },
    responsePreview: { type: String, default: "" },
    promptChars: { type: Number, default: 0 },
    responseChars: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
  },
  { timestamps: true },
);

aiHistoryEventSchema.index({ createdAt: -1 });
aiHistoryEventSchema.index({ actorEmail: 1, createdAt: -1 });
aiHistoryEventSchema.index({ provider: 1, status: 1, createdAt: -1 });

export const AIHistoryEvent = mongoose.model("AIHistoryEvent", aiHistoryEventSchema);
