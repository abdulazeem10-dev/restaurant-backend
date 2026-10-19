const mongoose = require("mongoose");

const deliveryDetailsSchema = new mongoose.Schema({
  recipientType: { type: String, enum: ["self", "other"], required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, match: /^\d{10}$/ },
  flatBuilding: { type: String, required: true, trim: true, maxlength: 120 },
  lane: { type: String, required: true, trim: true, maxlength: 180 },
  landmark: { type: String, trim: true, maxlength: 120, default: "" },
  pincode: { type: String, required: true, match: /^\d{6}$/ }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // A client supplied key makes order creation safe to retry after a timeout.
  idempotencyKey: { type: String, minlength: 36, maxlength: 36, select: false },
  idempotencyRequestHash: { type: String, minlength: 64, maxlength: 64, select: false },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  deliveryAddress: { type: String, required: true, trim: true, maxlength: 500 },
  deliveryDetails: { type: deliveryDetailsSchema, default: undefined },
  deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  deliveryAssignmentStatus: { type: String, enum: ["offered", "accepted", "unassigned"] },
  declinedDeliveryPartnerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  deliveryLocation: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    updatedAt: { type: Date, default: null }
  },
  customerLocation: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    updatedAt: { type: Date, default: null }
  },
  estimatedDeliveryAt: { type: Date, default: null },
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
  paymentMethod: { type: String, enum: ["cash_on_delivery", "online", "upi_qr", "razorpay"], default: "cash_on_delivery" },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
  paymentCollectedAt: { type: Date, default: null },
  customerReceivedAt: { type: Date, default: null },
  cancellationRequest: {
    status: { type: String, enum: ["none", "pending", "approved", "declined"], default: "none" },
    reason: { type: String, trim: true, maxlength: 80, default: "" },
    details: { type: String, trim: true, maxlength: 500, default: "" },
    requestedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    response: { type: String, trim: true, maxlength: 500, default: "" }
  },
  supportRequests: [{
    category: { type: String, enum: ["missing_item", "food_quality", "delivery", "payment", "other"], required: true },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    response: { type: String, trim: true, maxlength: 1000, default: "" },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  }],
  status: {
    type: String,
    enum: ["awaiting_payment", "placed", "confirmed", "preparing", "ready", "out_for_delivery", "picked_up", "delivered", "cancelled"],
    default: "placed"
  },
  statusHistory: [{
    status: { type: String, enum: ["awaiting_payment", "placed", "confirmed", "preparing", "ready", "out_for_delivery", "picked_up", "delivered", "cancelled"], required: true },
    at: { type: Date, required: true, default: Date.now }
  }]
}, {
  timestamps: true,
  toJSON: {
    transform(_document, value) {
      delete value.idempotencyKey;
      delete value.idempotencyRequestHash;
      return value;
    }
  }
});

orderSchema.index(
  { customerId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "customer_idempotency_unique"
  }
);

module.exports = mongoose.model("Order", orderSchema);
