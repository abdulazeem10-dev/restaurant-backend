const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  audience: { type: String, enum: ["customer", "restaurant"], required: true },
  type: { type: String, enum: ["order_delivered", "cancellation_requested", "cancellation_reviewed", "order_help_requested", "order_help_resolved"], required: true },
  title: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 300 },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ userId: 1, orderId: 1, audience: 1 }, { unique: true });
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
