const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, maxlength: 2000, default: "" },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }
  },
  isOpen: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: "pending" }
}, { timestamps: true });

restaurantSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Restaurant", restaurantSchema);
