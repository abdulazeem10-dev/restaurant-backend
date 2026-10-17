const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  pricePaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  available: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
