import mongoose from "mongoose";

const integrationSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    targetUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    type: { type: String, default: "Load", trim: true, maxlength: 60 },
    region: { type: String, default: "us-east-1", trim: true, maxlength: 60 },
    vus: { type: Number, required: true, min: 1, max: 100000 },
    duration: { type: String, required: true, trim: true, maxlength: 24 },
    script: { type: String, required: true },
    triggerType: {
      type: String,
      enum: ["cron"],
      default: "cron",
    },
    cronExpression: { type: String, required: true, trim: true, maxlength: 120 },
    timezone: { type: String, default: "UTC", trim: true, maxlength: 80 },
    isEnabled: { type: Boolean, default: true },
    allowApiTrigger: { type: Boolean, default: true },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastTriggeredAt: { type: Date, default: null },
    lastRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestRun",
      default: null,
    },
    lastRunStatus: { type: String, default: "" },
    lastTriggerSource: { type: String, default: "" },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

integrationSchema.index({ projectId: 1, createdAt: -1 });
integrationSchema.index({ projectId: 1, isEnabled: 1, triggerType: 1 });

export const Integration = mongoose.model("Integration", integrationSchema);
