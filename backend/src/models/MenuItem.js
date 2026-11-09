const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  imageUrl: { type: String, trim: true, maxlength: 2048, default: "" },
  pricePaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  foodType: { type: String, enum: ["veg", "nonVeg"] },
  available: { type: Boolean, default: true },
  stockTracked: { type: Boolean, default: false },
  stockQuantity: { type: Number, min: 0, default: null, validate: Number.isSafeInteger },
  lowStockThreshold: { type: Number, min: 0, default: 5, validate: Number.isSafeInteger }
}, { timestamps: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
