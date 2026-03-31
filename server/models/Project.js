import mongoose from "mongoose";

const projectAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    username: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
    canView: { type: Boolean, default: true },
    canRun: { type: Boolean, default: false },
  },
  { _id: false },
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    baseUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    description: { type: String, default: "", trim: true, maxlength: 280 },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ownerEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    ownerUsername: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    accessList: { type: [projectAccessSchema], default: [] },
  },
  { timestamps: true },
);

projectSchema.index({ createdAt: -1 });
projectSchema.index({ ownerUserId: 1, createdAt: -1 });
projectSchema.index({ "accessList.userId": 1 });
projectSchema.index({ "accessList.email": 1 });

export const Project = mongoose.model("Project", projectSchema);
