const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  deliveryAddress: { type: String, required: true, trim: true, maxlength: 500 },
  deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    unitPricePaise: { type: Number, required: true, min: 1 },
    quantity: { type: Number, required: true, min: 1, max: 20 }
  }],
  subtotalPaise: { type: Number, required: true, min: 0 },
  deliveryFeePaise: { type: Number, required: true, min: 0, default: 0 },
  taxPaise: { type: Number, required: true, min: 0, default: 0 },
  totalPaise: { type: Number, required: true, min: 0 },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  status: {
    type: String,
    enum: ["placed", "confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled"],
    default: "placed"
  }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
