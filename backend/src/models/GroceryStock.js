const mongoose = require("mongoose");

const groceryStockSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, trim: true, maxlength: 60, default: "Other" },
  quantity: { type: Number, required: true, min: 0, max: 10000000 },
  unit: { type: String, required: true, trim: true, maxlength: 24, default: "kg" },
  lowStockThreshold: { type: Number, required: true, min: 0, max: 10000000, default: 1 },
  receivedDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  expiryDate: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  supplier: { type: String, trim: true, maxlength: 120, default: "" },
  purchaseTotalPaise: { type: Number, min: 0, max: 1000000000, default: 0, validate: Number.isSafeInteger },
  paymentMethod: { type: String, enum: ["cash", "upi", "card", "bank_transfer", "credit", "other"], default: "cash" },
  notes: { type: String, trim: true, maxlength: 500, default: "" }
}, { timestamps: true });

groceryStockSchema.index({ restaurantId: 1, expiryDate: 1 });

module.exports = mongoose.model("GroceryStock", groceryStockSchema);
