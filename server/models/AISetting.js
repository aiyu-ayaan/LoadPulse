import mongoose from "mongoose";

const aiSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    autoGenerateTestSummary: { type: Boolean, default: false },
    maxPromptsPerPeriod: { type: Number, default: 50, min: 1, max: 100000 },
    promptCreditResetInterval: {
      type: String,
      enum: ["day", "week", "month"],
      default: "day",
    },
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
