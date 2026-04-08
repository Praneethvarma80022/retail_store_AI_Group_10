const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      index: true,
      sparse: true
      // Removed unique: true to allow email-based auth users without googleId
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    picture: {
      type: String,
      trim: true,
      default: ""
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "admin"
    },
    workspaceName: {
      type: String,
      trim: true,
      default: ""
    },
    // Email/password authentication
    passwordHash: {
      type: String,
      default: null
    },
    // TOTP two-factor authentication
    totpSecret: {
      type: String,
      default: null
    },
    totpVerified: {
      type: Boolean,
      default: false
    },
    totpBackupCodes: {
      type: [String],
      default: []
    },
    authMethod: {
      type: String,
      enum: ["google", "email", "email-totp"],
      default: "google"
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.UserProfile || mongoose.model("UserProfile", userProfileSchema);
