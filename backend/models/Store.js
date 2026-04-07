const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    normalizedName: {
      type: String,
      required: true,
      index: true
    },
    sku: {
      type: String,
      trim: true,
      default: ""
    },
    category: {
      type: String,
      trim: true,
      default: "General"
    },
    reorderLevel: {
      type: Number,
      min: 0,
      default: 5
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    totalPrice: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

storeSchema.pre("validate", function syncDerivedFields() {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }

  if (this.sku) {
    this.sku = this.sku
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  this.category = this.category?.trim?.() || "General";
  this.reorderLevel = Number.isFinite(Number(this.reorderLevel))
    ? Number(this.reorderLevel)
    : 5;

  this.totalPrice = Number(
    ((Number(this.quantity) || 0) * (Number(this.price) || 0)).toFixed(2)
  );
});

module.exports = mongoose.models.Store || mongoose.model("Store", storeSchema);
