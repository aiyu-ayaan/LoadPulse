import mongoose from "mongoose";

const aiSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    autoGenerateTestSummary: { type: Boolean, default: false },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export const AISetting = mongoose.model("AISetting", aiSettingSchema);
