const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
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
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    mobile: {
      type: String,
      trim: true,
      default: ""
    },
    productId: {
      type: String,
      default: ""
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    date: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

saleSchema.pre("validate", function syncSaleTotals() {
  this.customerName = this.customerName?.trim?.() || "";
  this.mobile = this.mobile?.trim?.() || "";
  this.productName = this.productName?.trim?.() || "";
  this.totalPrice = Number(
    ((Number(this.quantity) || 0) * (Number(this.unitPrice) || 0)).toFixed(2)
  );
});

module.exports = mongoose.models.Sale || mongoose.model("Sale", saleSchema);
