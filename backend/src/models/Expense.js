const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 240 },
  amountPaise: { type: Number, required: true, min: 1, max: 10000000000, validate: Number.isSafeInteger },
  spentAt: { type: Date, required: true, index: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
  paymentMethod: { type: String, enum: ["cash", "upi", "card", "bank_transfer", "credit", "other"], default: "cash" },
  reference: { type: String, trim: true, maxlength: 100, default: "" },
  notes: { type: String, trim: true, maxlength: 500, default: "" }
}, { timestamps: true });

expenseSchema.index({ restaurantId: 1, spentAt: -1 });
module.exports = mongoose.model("Expense", expenseSchema);
