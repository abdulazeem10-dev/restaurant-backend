const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  status: { type: String, enum: ["unassigned", "assigned", "accepted", "picked_up", "delivered", "failed"], default: "unassigned" },
  assignedAt: { type: Date, default: null },
  pickedUpAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  deliveryNotes: { type: String, maxlength: 1000, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("Delivery", deliverySchema);
