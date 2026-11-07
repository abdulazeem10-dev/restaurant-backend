const mongoose = require("mongoose");

const aggregatorSaleSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  platform: { type: String, enum: ["zomato", "swiggy"], required: true },
  externalOrderId: { type: String, required: true, trim: true, maxlength: 120 },
  orderDate: { type: Date, required: true, index: true },
  status: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
  grossPaise: { type: Number, required: true, min: 0 },
  commissionPaise: { type: Number, required: true, min: 0 },
  payoutPaise: { type: Number, required: true, min: 0 },
  importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

aggregatorSaleSchema.index({ restaurantId: 1, platform: 1, externalOrderId: 1 }, { unique: true });
module.exports = mongoose.model("AggregatorSale", aggregatorSaleSchema);
