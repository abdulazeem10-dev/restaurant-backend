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
  lowStockThreshold: { type: Number, min: 0, default: 5, validate: Number.isSafeInteger },
  recipe: [{
    ingredientName: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0.001, max: 1000000 },
    unit: { type: String, required: true, trim: true, maxlength: 24 },
    costPaise: { type: Number, required: true, min: 0, max: 100000000, validate: Number.isSafeInteger }
  }]
}, { timestamps: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
