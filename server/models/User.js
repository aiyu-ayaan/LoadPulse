import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    githubId: { type: String, default: "", unique: true, sparse: true },
    githubUsername: { type: String, default: "", trim: true, lowercase: true, maxlength: 80 },
    avatarDataUrl: { type: String, default: "", maxlength: 1_500_000 },
    passwordHash: { type: String, default: "" },
    isAdmin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecretEncrypted: { type: String, default: "" },
    pendingTwoFactorSecretEncrypted: { type: String, default: "" },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
