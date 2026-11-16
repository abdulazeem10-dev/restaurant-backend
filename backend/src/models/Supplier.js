const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 20, default: "" },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
  address: { type: String, trim: true, maxlength: 500, default: "" },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: "" },
  notes: { type: String, trim: true, maxlength: 500, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

supplierSchema.index({ restaurantId: 1, name: 1 });
module.exports = mongoose.model("Supplier", supplierSchema);
