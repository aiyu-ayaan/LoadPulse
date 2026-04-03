import mongoose from "mongoose";

const statusCodeSchema = new mongoose.Schema(
  {
    ok2xx: { type: Number, default: 0 },
    client4xx: { type: Number, default: 0 },
    server5xx: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  { _id: false },
);

const timelinePointSchema = new mongoose.Schema(
  {
    time: { type: String, required: true },
    value: { type: Number, required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const liveMetricsSchema = new mongoose.Schema(
  {
    totalRequests: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
    errorRatePct: { type: Number, default: 0 },
    throughputRps: { type: Number, default: 0 },
    statusCodes: { type: statusCodeSchema, default: () => ({}) },
    responseTimeSeries: { type: [timelinePointSchema], default: [] },
    rpsSeries: { type: [timelinePointSchema], default: [] },
    lastUpdatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const finalMetricsSchema = new mongoose.Schema(
  {
    totalRequests: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
    p95LatencyMs: { type: Number, default: 0 },
    p99LatencyMs: { type: Number, default: 0 },
    errorRatePct: { type: Number, default: 0 },
    throughputRps: { type: Number, default: 0 },
    checksPassed: { type: Number, default: 0 },
    checksFailed: { type: Number, default: 0 },
    statusCodes: { type: statusCodeSchema, default: () => ({}) },
  },
  { _id: false },
);

const testRunSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    projectName: { type: String, required: true, trim: true, maxlength: 120 },
    projectBaseUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    targetUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    type: { type: String, default: "Load", trim: true, maxlength: 60 },
    region: { type: String, default: "us-east-1", trim: true, maxlength: 60 },
    vus: { type: Number, required: true, min: 1, max: 100000 },
    duration: { type: String, required: true, trim: true, maxlength: 24 },
    script: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "running", "success", "failed", "stopped"],
      default: "queued",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
    liveMetrics: { type: liveMetricsSchema, default: () => ({}) },
    finalMetrics: { type: finalMetricsSchema, default: null },
  },
  { timestamps: true },
);

testRunSchema.index({ createdAt: -1 });
testRunSchema.index({ status: 1, createdAt: -1 });
testRunSchema.index({ projectId: 1, createdAt: -1 });

export const TestRun = mongoose.model("TestRun", testRunSchema);
