const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    ownerId: {
      type: String,
      required: true,
      index: true
    },
    ownerEmail: {
      type: String,
      trim: true,
      default: ""
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      trim: true,
      default: ""
    },
    intent: {
      type: String,
      trim: true,
      default: ""
    },
    matchedProducts: {
      type: [String],
      default: []
    },
    matchedCustomers: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", chatMessageSchema);
