import mongoose from "mongoose";

const projectIntegrationTokenSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      unique: true,
    },
    tokenHash: { type: String, required: true, maxlength: 128 },
    tokenPreview: { type: String, required: true, maxlength: 32 },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectIntegrationTokenSchema.index({ updatedAt: -1 });

export const ProjectIntegrationToken = mongoose.model("ProjectIntegrationToken", projectIntegrationTokenSchema);
