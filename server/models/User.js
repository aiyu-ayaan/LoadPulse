import mongoose from "mongoose";

const projectPermissionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    canView: { type: Boolean, default: true },
    canRun: { type: Boolean, default: false },
  },
  { _id: false },
);

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
    passwordHash: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    projectPermissions: { type: [projectPermissionSchema], default: [] },
  },
  { timestamps: true },
);

export const User = mongoose.model("User", userSchema);
