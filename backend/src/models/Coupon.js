const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
  code: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 24 },
  discountType: { type: String, enum: ["percent", "fixed"], required: true },
  // Percentage coupons use basis points (1000 = 10%); fixed coupons use paise.
  discountValue: { type: Number, required: true, min: 1, max: 10000000, validate: Number.isSafeInteger },
  maxDiscountPaise: { type: Number, min: 0, max: 1000000000, default: 0, validate: Number.isSafeInteger },
  minSubtotalPaise: { type: Number, min: 0, max: 1000000000, default: 0, validate: Number.isSafeInteger },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  maxUses: { type: Number, min: 0, max: 10000000, default: 0, validate: Number.isSafeInteger },
  usedCount: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
  active: { type: Boolean, default: true }
}, { timestamps: true });

couponSchema.index({ restaurantId: 1, code: 1 }, { unique: true });
module.exports = mongoose.model("Coupon", couponSchema);
