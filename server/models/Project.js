import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    baseUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    description: { type: String, default: "", trim: true, maxlength: 280 },
  },
  { timestamps: true },
);

projectSchema.index({ createdAt: -1 });

export const Project = mongoose.model("Project", projectSchema);
