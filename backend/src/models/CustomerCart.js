const mongoose = require("mongoose");

const customerCartSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  items: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    pricePaise: { type: Number, required: true, min: 1 },
    quantity: { type: Number, required: true, min: 1, max: 20 }
  }]
}, { timestamps: true });

module.exports = mongoose.model("CustomerCart", customerCartSchema);
