const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  provider: { type: String, required: true },
  providerReference: { type: String, required: true, unique: true },
  providerPaymentId: { type: String, default: "" },
  amountPaise: { type: Number, required: true, min: 1 },
  termYears: { type: Number, enum: [1, 2, 3], required: true },
  status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
  subscriptionEndsAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("SubscriptionPayment", schema);
