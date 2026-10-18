const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  provider: { type: String, required: true },
  providerReference: { type: String, required: true, unique: true },
  providerPaymentId: { type: String, default: "" },
  amountPaise: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  processedEventIds: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
