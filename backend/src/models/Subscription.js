const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  planId: { type: String, required: true, trim: true },
  planTier: { type: String, enum: ["bronze", "silver", "gold"], default: "bronze", index: true },
  seatRevision: { type: Number, default: 0 },
  termYears: { type: Number, enum: [1, 2, 3], required: true, default: 1 },
  providerSubscriptionId: { type: String, default: null, unique: true, sparse: true },
  status: { type: String, enum: ["pending", "active", "past_due", "cancelled", "expired"], default: "pending" },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  renewalRequest: { years: { type: Number, enum: [1, 2, 3], default: null }, status: { type: String, enum: ["none", "pending"], default: "none" }, requestedAt: { type: Date, default: null } },
  cancelAtPeriodEnd: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
